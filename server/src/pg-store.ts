import { Pool, PoolClient, QueryResult } from "pg";
import { ListQuery, ListResult, ProductionRepository } from "./store.js";
import {
  AuditSnapshot, CloseRequest, Completion, CompletionAllocation, Demand, DemandSource, IdempotencyRecord,
  InboxEvent, Inspection, InventoryAvailability, OperationTask, OutboxEvent, ReportCorrection, ReworkOrder,
  SalesOrderIntake, StatusHistory, WorkOrder,
  WorkOrderDemand, WorkReport,
} from "./types.js";

function camelKey(key: string) {
  return key.replace(/_([a-z])/g, (_, character: string) => character.toUpperCase());
}

function mapRow<T>(row: Record<string, any>): T {
  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(row)) {
    const target = key === "row_version" ? "version" : camelKey(key);
    if ((target === "version" || target.endsWith("Version") || target === "progress" || target === "retryCount" || target === "maxRetryCount") && typeof value === "string") {
      result[target] = Number(value);
    } else if (value instanceof Date) result[target] = value.toISOString();
    else result[target] = value;
  }
  return result as T;
}

export class PgProductionRepository implements ProductionRepository {
  private currentTenant?: string;

  constructor(private readonly pool: Pool, private readonly client?: PoolClient) {}

  static fromConnectionString(connectionString: string) {
    return new PgProductionRepository(new Pool({ connectionString, max: Number(process.env.PRODUCTION_DB_POOL_SIZE ?? 20) }));
  }

  async close() { await this.pool.end(); }

  private async query<T extends Record<string, any> = any>(tenantId: string, text: string, values: any[] = []): Promise<QueryResult<T>> {
    if (this.client) {
      if (!this.currentTenant) {
        await this.client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
        this.currentTenant = tenantId;
      } else if (this.currentTenant !== tenantId) throw new Error("Cross-tenant transaction is not allowed");
      return this.client.query<T>(text, values);
    }
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
      const result = await client.query<T>(text, values);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  }

  async transaction<T>(work: (repository: ProductionRepository) => Promise<T>): Promise<T> {
    if (this.client) return work(this);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await work(new PgProductionRepository(this.pool, client));
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  }

  async listDemands(tenantId: string, query: ListQuery): Promise<ListResult<Demand>> {
    const filters = ["tenant_id=$1"]; const values: any[] = [tenantId];
    if (query.status) { values.push(query.status); filters.push(`status=$${values.length}`); }
    if (query.factoryResourceId) { values.push(query.factoryResourceId); filters.push(`factory_resource_id=$${values.length}`); }
    if (query.search) { values.push(`%${query.search}%`); filters.push(`(code ILIKE $${values.length} OR product_id ILIKE $${values.length} OR product_name ILIKE $${values.length})`); }
    values.push(query.limit, query.offset);
    const result = await this.query(tenantId, `SELECT *, count(*) OVER() AS _total FROM prod_demand WHERE ${filters.join(" AND ")} ORDER BY created_at DESC LIMIT $${values.length - 1} OFFSET $${values.length}`, values);
    return { items: result.rows.map((row) => { const value = mapRow<Demand>(row); delete (value as any).Total; delete (value as any)._total; return value; }), total: Number(result.rows[0]?._total ?? 0) };
  }
  async getDemand(tenantId: string, id: string) { const r = await this.query(tenantId, "SELECT * FROM prod_demand WHERE tenant_id=$1 AND id=$2", [tenantId, id]); return r.rows[0] ? mapRow<Demand>(r.rows[0]) : undefined; }
  async getDemandSource(tenantId: string, demandId: string) { const r = await this.query(tenantId, "SELECT * FROM prod_demand_source WHERE tenant_id=$1 AND demand_id=$2 ORDER BY id LIMIT 1", [tenantId, demandId]); return r.rows[0] ? mapRow<DemandSource>(r.rows[0]) : undefined; }
  async insertDemand(value: Demand, source?: DemandSource) {
    await this.query(value.tenantId, `INSERT INTO prod_demand (id,tenant_id,code,source_type,product_id,product_name,qty,uom,due_date,priority,factory_resource_id,status,revision,correlation_id,block_reasons,created_by,row_version,created_at,updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16,$17,$18,$19)`,
      [value.id,value.tenantId,value.code,value.sourceType,value.productId,value.productName,value.qty,value.uom,value.dueDate,value.priority,value.factoryResourceId,value.status,value.revision,value.correlationId,JSON.stringify(value.blockReasons),value.createdBy,value.version,value.createdAt,value.updatedAt]);
    if (source) await this.query(value.tenantId, `INSERT INTO prod_demand_source (id,tenant_id,demand_id,source_system,source_type,source_id,source_line_id,source_revision,qty,payload_snapshot,shipment_request_id,shipment_request_line_id,sales_order_line_id) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13)`,
      [source.id,source.tenantId,source.demandId,source.sourceSystem,source.sourceType,source.sourceId,source.sourceLineId,source.sourceRevision,source.qty,JSON.stringify(source.payloadSnapshot),source.shipmentRequestId,source.shipmentRequestLineId,source.salesOrderLineId]);
  }
  async updateDemand(value: Demand, expectedVersion: number) {
    const r = await this.query(value.tenantId, `UPDATE prod_demand SET status=$3,block_reasons=$4::jsonb,row_version=$5,updated_at=$6 WHERE tenant_id=$1 AND id=$2 AND row_version=$7`,
      [value.tenantId,value.id,value.status,JSON.stringify(value.blockReasons),value.version,value.updatedAt,expectedVersion]); return r.rowCount === 1;
  }

  async listWorkOrders(tenantId: string, query: ListQuery): Promise<ListResult<WorkOrder>> {
    const filters = ["tenant_id=$1"]; const values: any[] = [tenantId];
    if (query.status) { values.push(query.status); filters.push(`status=$${values.length}`); }
    if (query.factoryResourceId) { values.push(query.factoryResourceId); filters.push(`factory_resource_id=$${values.length}`); }
    if (query.search) { values.push(`%${query.search}%`); filters.push(`(code ILIKE $${values.length} OR product_id ILIKE $${values.length} OR product_name ILIKE $${values.length})`); }
    values.push(query.limit, query.offset);
    const result = await this.query(tenantId, `SELECT *, count(*) OVER() AS _total FROM prod_work_order WHERE ${filters.join(" AND ")} ORDER BY created_at DESC LIMIT $${values.length - 1} OFFSET $${values.length}`, values);
    return { items: result.rows.map((row) => { const value = mapRow<WorkOrder>(row); delete (value as any).Total; delete (value as any)._total; return value; }), total: Number(result.rows[0]?._total ?? 0) };
  }
  async getWorkOrder(tenantId: string, id: string) { const r = await this.query(tenantId, "SELECT * FROM prod_work_order WHERE tenant_id=$1 AND id=$2", [tenantId,id]); return r.rows[0] ? mapRow<WorkOrder>(r.rows[0]) : undefined; }
  async insertWorkOrder(value: WorkOrder, links: WorkOrderDemand[]) {
    await this.query(value.tenantId, `INSERT INTO prod_work_order (id,tenant_id,code,product_id,product_name,factory_resource_id,workshop_resource_id,line_resource_id,work_center_resource_id,planned_qty,input_qty,reported_good_qty,reported_defect_qty,reported_scrap_qty,posted_qty,uom,due_date,status,bom_snapshot_id,routing_snapshot_id,schedule_candidate_id,kitting_check_id,kitting_status,assignee_employee_id,correlation_id,parameter_snapshot,created_by,row_version,created_at,updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26::jsonb,$27,$28,$29,$30)`,
      [value.id,value.tenantId,value.code,value.productId,value.productName,value.factoryResourceId,value.workshopResourceId,value.lineResourceId,value.workCenterResourceId,value.plannedQty,value.inputQty,value.reportedGoodQty,value.reportedDefectQty,value.reportedScrapQty,value.postedQty,value.uom,value.dueDate,value.status,value.bomSnapshotId,value.routingSnapshotId,value.scheduleCandidateId,value.kittingCheckId,value.kittingStatus,value.assigneeEmployeeId,value.correlationId,JSON.stringify(value.parameterSnapshot),value.createdBy,value.version,value.createdAt,value.updatedAt]);
    for (const link of links) await this.query(value.tenantId, `INSERT INTO prod_work_order_demand (id,tenant_id,work_order_id,demand_id,allocated_qty,priority_rank,customer_locked,promised_date) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [link.id,link.tenantId,link.workOrderId,link.demandId,link.allocatedQty,link.priorityRank,link.customerLocked,link.promisedDate]);
  }
  async updateWorkOrder(value: WorkOrder, expectedVersion: number) {
    const r = await this.query(value.tenantId, `UPDATE prod_work_order SET status=$3,input_qty=$4,reported_good_qty=$5,reported_defect_qty=$6,reported_scrap_qty=$7,posted_qty=$8,row_version=$9,updated_at=$10 WHERE tenant_id=$1 AND id=$2 AND row_version=$11`,
      [value.tenantId,value.id,value.status,value.inputQty,value.reportedGoodQty,value.reportedDefectQty,value.reportedScrapQty,value.postedQty,value.version,value.updatedAt,expectedVersion]); return r.rowCount === 1;
  }
  async listWorkOrderDemands(tenantId: string, workOrderId: string) { const r = await this.query(tenantId, "SELECT * FROM prod_work_order_demand WHERE tenant_id=$1 AND work_order_id=$2 ORDER BY customer_locked DESC,priority_rank,promised_date,demand_id", [tenantId,workOrderId]); return r.rows.map(mapRow<WorkOrderDemand>); }

  async insertWorkReport(v: WorkReport) { await this.query(v.tenantId, `INSERT INTO prod_work_report (id,tenant_id,work_order_id,operation_id,good_qty,defect_qty,scrap_qty,input_qty,uom,status,reported_by,reported_at,source,remark,row_version,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`, [v.id,v.tenantId,v.workOrderId,v.operationId,v.goodQty,v.defectQty,v.scrapQty,v.inputQty,v.uom,v.status,v.reportedBy,v.reportedAt,v.source,v.remark,v.version,v.createdAt,v.updatedAt]); }
  async getWorkReport(tenantId: string, id: string) { const r=await this.query(tenantId,"SELECT * FROM prod_work_report WHERE tenant_id=$1 AND id=$2",[tenantId,id]); return r.rows[0]?mapRow<WorkReport>(r.rows[0]):undefined; }
  async listWorkReports(tenantId: string, workOrderId: string) { const r=await this.query(tenantId,"SELECT * FROM prod_work_report WHERE tenant_id=$1 AND work_order_id=$2",[tenantId,workOrderId]); return r.rows.map(mapRow<WorkReport>); }
  async updateWorkReport(v: WorkReport, expectedVersion: number) { const r=await this.query(v.tenantId,"UPDATE prod_work_report SET status=$3,row_version=$4,updated_at=$5 WHERE tenant_id=$1 AND id=$2 AND row_version=$6",[v.tenantId,v.id,v.status,v.version,v.updatedAt,expectedVersion]); return r.rowCount===1; }
  async insertReportCorrection(v: ReportCorrection, replacement: WorkReport) { await this.insertWorkReport(replacement); await this.query(v.tenantId,`INSERT INTO prod_work_report_correction (id,tenant_id,original_report_id,replacement_report_id,reason_code,reason,original_snapshot,corrected_snapshot,status,created_by,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,$11)`,[v.id,v.tenantId,v.originalReportId,v.replacementReportId,v.reasonCode,v.reason,JSON.stringify(v.originalSnapshot),JSON.stringify(v.correctedSnapshot),v.status,v.createdBy,v.createdAt]); }

  async insertInspection(v: Inspection) { await this.query(v.tenantId,`INSERT INTO prod_inspection (id,tenant_id,code,work_order_id,inspection_type,parent_inspection_id,sample_qty,passed_qty,failed_qty,status,inspector_id,inspected_at,result_reason,row_version,created_by,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,[v.id,v.tenantId,v.code,v.workOrderId,v.inspectionType,v.parentInspectionId,v.sampleQty,v.passedQty,v.failedQty,v.status,v.inspectorId,v.inspectedAt,v.resultReason,v.version,v.createdBy,v.createdAt,v.updatedAt]); }
  async getInspection(tenantId:string,id:string){const r=await this.query(tenantId,"SELECT * FROM prod_inspection WHERE tenant_id=$1 AND id=$2",[tenantId,id]);return r.rows[0]?mapRow<Inspection>(r.rows[0]):undefined;}
  async listInspections(tenantId:string,workOrderId?:string){const r=await this.query(tenantId,`SELECT * FROM prod_inspection WHERE tenant_id=$1 ${workOrderId?"AND work_order_id=$2":""} ORDER BY created_at`,workOrderId?[tenantId,workOrderId]:[tenantId]);return r.rows.map(mapRow<Inspection>);}
  async updateInspection(v:Inspection,expectedVersion:number){const r=await this.query(v.tenantId,`UPDATE prod_inspection SET status=$3,passed_qty=$4,failed_qty=$5,inspector_id=$6,inspected_at=$7,result_reason=$8,row_version=$9,updated_at=$10 WHERE tenant_id=$1 AND id=$2 AND row_version=$11`,[v.tenantId,v.id,v.status,v.passedQty,v.failedQty,v.inspectorId,v.inspectedAt,v.resultReason,v.version,v.updatedAt,expectedVersion]);return r.rowCount===1;}
  async insertReworkOrder(v:ReworkOrder){await this.query(v.tenantId,`INSERT INTO prod_rework_order (id,tenant_id,code,source_inspection_id,work_order_id,qty,status,created_by,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)`,[v.id,v.tenantId,v.code,v.sourceInspectionId,v.workOrderId,v.qty,v.status,v.createdBy,v.createdAt]);}

  async insertCompletion(v:Completion){await this.query(v.tenantId,`INSERT INTO prod_completion (id,tenant_id,code,work_order_id,inspection_id,qty,uom,warehouse_resource_id,inventory_warehouse_id,bin_id,trace_mode,batch_no,serial_numbers,production_date,allocation_revision,status,inventory_idempotency_key,task_id,remark,created_by,row_version,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)`,[v.id,v.tenantId,v.code,v.workOrderId,v.inspectionId,v.qty,v.uom,v.warehouseResourceId,v.inventoryWarehouseId,v.binId,v.traceMode,v.batchNo,JSON.stringify(v.serialNumbers),v.productionDate,v.allocationRevision,v.status,v.inventoryIdempotencyKey,v.taskId,v.remark,v.createdBy,v.version,v.createdAt,v.updatedAt]);for(const serial of v.serialNumbers)await this.query(v.tenantId,"INSERT INTO prod_completion_serial (tenant_id,completion_id,serial_number) VALUES ($1,$2,$3)",[v.tenantId,v.id,serial]);}
  async getCompletion(tenantId:string,id:string){const r=await this.query(tenantId,"SELECT * FROM prod_completion WHERE tenant_id=$1 AND id=$2",[tenantId,id]);return r.rows[0]?mapRow<Completion>(r.rows[0]):undefined;}
  async listCompletions(tenantId:string,workOrderId?:string){const r=await this.query(tenantId,`SELECT * FROM prod_completion WHERE tenant_id=$1 ${workOrderId?"AND work_order_id=$2":""} ORDER BY created_at`,workOrderId?[tenantId,workOrderId]:[tenantId]);return r.rows.map(mapRow<Completion>);}
  async updateCompletion(v:Completion,expectedVersion:number){const r=await this.query(v.tenantId,`UPDATE prod_completion SET status=$3,bin_id=$4,batch_no=$5,external_transaction_id=$6,failure_code=$7,failure_message=$8,remark=$9,posted_at=$10,row_version=$11,updated_at=$12 WHERE tenant_id=$1 AND id=$2 AND row_version=$13`,[v.tenantId,v.id,v.status,v.binId,v.batchNo,v.externalTransactionId,v.failureCode,v.failureMessage,v.remark,v.postedAt,v.version,v.updatedAt,expectedVersion]);return r.rowCount===1;}
  async insertCompletionAllocations(values:CompletionAllocation[]){for(const v of values)await this.query(v.tenantId,`INSERT INTO prod_completion_allocation (id,tenant_id,completion_id,demand_id,qty,rank,rule_evidence,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,$8)`,[v.id,v.tenantId,v.completionId,v.demandId,v.qty,v.rank,JSON.stringify(v.ruleEvidence),v.createdAt]);}
  async listCompletionAllocations(tenantId:string,completionId:string){const r=await this.query(tenantId,"SELECT * FROM prod_completion_allocation WHERE tenant_id=$1 AND completion_id=$2 ORDER BY rank",[tenantId,completionId]);return r.rows.map(mapRow<CompletionAllocation>);}
  async serialNumbersExist(tenantId:string,serialNumbers:string[]){if(!serialNumbers.length)return [];const r=await this.query(tenantId,"SELECT serial_number FROM prod_completion_serial WHERE tenant_id=$1 AND serial_number=ANY($2::text[])",[tenantId,serialNumbers]);return r.rows.map((row:any)=>row.serial_number);}

  async insertCloseRequest(v:CloseRequest){await this.query(v.tenantId,`INSERT INTO prod_work_order_close (id,tenant_id,work_order_id,status,check_snapshot,variance_snapshot,reason,submitted_by,submitted_at,row_version,created_at,updated_at) VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7,$8,$9,$10,$11,$12)`,[v.id,v.tenantId,v.workOrderId,v.status,JSON.stringify(v.checkSnapshot),JSON.stringify(v.varianceSnapshot),v.reason,v.submittedBy,v.submittedAt,v.version,v.createdAt,v.updatedAt]);}
  async getCloseRequest(tenantId:string,id:string){const r=await this.query(tenantId,"SELECT * FROM prod_work_order_close WHERE tenant_id=$1 AND id=$2",[tenantId,id]);return r.rows[0]?mapRow<CloseRequest>(r.rows[0]):undefined;}
  async listCloseRequests(tenantId:string,workOrderId:string){const r=await this.query(tenantId,"SELECT * FROM prod_work_order_close WHERE tenant_id=$1 AND work_order_id=$2",[tenantId,workOrderId]);return r.rows.map(mapRow<CloseRequest>);}
  async updateCloseRequest(v:CloseRequest,expectedVersion:number){const r=await this.query(v.tenantId,`UPDATE prod_work_order_close SET status=$3,approved_by=$4,approved_at=$5,row_version=$6,updated_at=$7 WHERE tenant_id=$1 AND id=$2 AND row_version=$8`,[v.tenantId,v.id,v.status,v.approvedBy,v.approvedAt,v.version,v.updatedAt,expectedVersion]);return r.rowCount===1;}
  async hasBlockingMaterialTransactions(tenantId:string,workOrderId:string){const r=await this.query(tenantId,"SELECT 1 FROM prod_material_transaction WHERE tenant_id=$1 AND work_order_id=$2 AND status IN ('POSTING','FAILED') LIMIT 1",[tenantId,workOrderId]);return r.rowCount===1;}

  async insertTask(v:OperationTask){await this.query(v.tenantId,`INSERT INTO prod_operation_task (id,tenant_id,task_type,aggregate_type,aggregate_id,status,progress,retry_count,max_retry_count,input,result,error_code,error_message,trace_id,created_by,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11::jsonb,$12,$13,$14,$15,$16,$17)`,[v.id,v.tenantId,v.taskType,v.aggregateType,v.aggregateId,v.status,v.progress,v.retryCount,v.maxRetryCount,JSON.stringify(v.input),v.result===undefined?null:JSON.stringify(v.result),v.errorCode,v.errorMessage,v.traceId,v.createdBy,v.createdAt,v.updatedAt]);}
  async getTask(tenantId:string,id:string){const r=await this.query(tenantId,"SELECT * FROM prod_operation_task WHERE tenant_id=$1 AND id=$2",[tenantId,id]);return r.rows[0]?mapRow<OperationTask>(r.rows[0]):undefined;}
  async findSucceededPlanningTaskByCandidate(tenantId:string,candidateId:string){const r=await this.query(tenantId,"SELECT * FROM prod_operation_task WHERE tenant_id=$1 AND task_type='APS_RUN' AND status='SUCCEEDED' AND result->'scheduleCandidates' @> $2::jsonb ORDER BY updated_at DESC LIMIT 1",[tenantId,JSON.stringify([{id:candidateId}])]);return r.rows[0]?mapRow<OperationTask>(r.rows[0]):undefined;}
  async findSucceededMrpTaskByDemand(tenantId:string,demandId:string){const r=await this.query(tenantId,"SELECT * FROM prod_operation_task WHERE tenant_id=$1 AND task_type='MRP_RUN' AND status='SUCCEEDED' AND result->'mpsLines' @> $2::jsonb ORDER BY updated_at DESC LIMIT 1",[tenantId,JSON.stringify([{demandId}])]);return r.rows[0]?mapRow<OperationTask>(r.rows[0]):undefined;}
  async updateTask(v:OperationTask){await this.query(v.tenantId,`UPDATE prod_operation_task SET status=$3,progress=$4,retry_count=$5,result=$6::jsonb,error_code=$7,error_message=$8,input=$9::jsonb,updated_at=$10 WHERE tenant_id=$1 AND id=$2`,[v.tenantId,v.id,v.status,v.progress,v.retryCount,v.result===undefined?null:JSON.stringify(v.result),v.errorCode,v.errorMessage,JSON.stringify(v.input),v.updatedAt]);}

  async addStatusHistory(v:StatusHistory){await this.query(v.tenantId,`INSERT INTO prod_status_history (id,tenant_id,aggregate_type,aggregate_id,from_status,to_status,reason_code,reason,actor_id,trace_id,metadata,occurred_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12)`,[v.id,v.tenantId,v.aggregateType,v.aggregateId,v.fromStatus,v.toStatus,v.reasonCode,v.reason,v.actorId,v.traceId,JSON.stringify(v.metadata),v.occurredAt]);}
  async addOutboxEvent(v:OutboxEvent){await this.query(v.tenantId,`INSERT INTO prod_event_outbox (id,tenant_id,event_id,event_type,event_version,aggregate_type,aggregate_id,aggregate_version,correlation_id,trace_id,payload,status,retry_count,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb,$12,$13,$14)`,[v.id,v.tenantId,v.eventId,v.eventType,v.eventVersion,v.aggregateType,v.aggregateId,v.aggregateVersion,v.correlationId,v.traceId,JSON.stringify(v.payload),v.status,v.retryCount,v.createdAt]);}
  async listPendingOutboxEvents(tenantId:string,eventType?:string){const values:any[]=[tenantId];const filters=["tenant_id=$1","status IN ('PENDING','RETRY_WAIT')","(next_retry_at IS NULL OR next_retry_at <= now())"];if(eventType){values.push(eventType);filters.push(`event_type=$${values.length}`);}const r=await this.query(tenantId,`SELECT * FROM prod_event_outbox WHERE ${filters.join(" AND ")} ORDER BY created_at FOR UPDATE SKIP LOCKED`,values);return r.rows.map(mapRow<OutboxEvent>);}
  async markOutboxEventPublished(tenantId:string,eventId:string){await this.query(tenantId,"UPDATE prod_event_outbox SET status='PUBLISHED',retry_count=retry_count+1,published_at=now(),next_retry_at=NULL,error_message=NULL WHERE tenant_id=$1 AND event_id=$2",[tenantId,eventId]);}
  async markOutboxEventFailed(tenantId:string,eventId:string,error:string,maxAttempts:number){await this.query(tenantId,"UPDATE prod_event_outbox SET retry_count=retry_count+1,status=CASE WHEN retry_count+1 >= $3 THEN 'DEAD_LETTER' ELSE 'RETRY_WAIT' END,next_retry_at=now()+CASE LEAST(retry_count,7) WHEN 0 THEN interval '10 seconds' WHEN 1 THEN interval '30 seconds' WHEN 2 THEN interval '2 minutes' WHEN 3 THEN interval '10 minutes' WHEN 4 THEN interval '30 minutes' WHEN 5 THEN interval '2 hours' WHEN 6 THEN interval '6 hours' ELSE interval '24 hours' END,error_message=$4 WHERE tenant_id=$1 AND event_id=$2",[tenantId,eventId,maxAttempts,error.slice(0,1000)]);}
  async addAudit(v:AuditSnapshot){await this.query(v.tenantId,`INSERT INTO prod_audit_snapshot (id,tenant_id,action,aggregate_type,aggregate_id,actor_account_id,actor_employee_id,permission_version,before_snapshot,after_snapshot,reason,trace_id,ip_address,user_agent,occurred_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12,$13,$14,$15)`,[v.id,v.tenantId,v.action,v.aggregateType,v.aggregateId,v.actorAccountId,v.actorEmployeeId,v.permissionVersion,v.beforeSnapshot===undefined?null:JSON.stringify(v.beforeSnapshot),v.afterSnapshot===undefined?null:JSON.stringify(v.afterSnapshot),v.reason,v.traceId,v.ipAddress,v.userAgent,v.occurredAt]);}
  async getIdempotency(tenantId:string,commandType:string,key:string){const r=await this.query(tenantId,"SELECT * FROM prod_idempotency_record WHERE tenant_id=$1 AND command_type=$2 AND idempotency_key=$3",[tenantId,commandType,key]);return r.rows[0]?mapRow<IdempotencyRecord>(r.rows[0]):undefined;}
  async saveIdempotency(v:IdempotencyRecord){const r=await this.query(v.tenantId,`INSERT INTO prod_idempotency_record (tenant_id,idempotency_key,command_type,request_hash,response_status,response_body,aggregate_type,aggregate_id,status,trace_id,created_at) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,'COMPLETED',$9,$10) ON CONFLICT DO NOTHING`,[v.tenantId,v.idempotencyKey,v.commandType,v.requestHash,v.responseStatus,JSON.stringify(v.responseBody),v.aggregateType,v.aggregateId,v.traceId,v.createdAt]);return r.rowCount===1;}

  async getInventoryAvailability(tenantId:string,productId:string,inventoryWarehouseId:string){const r=await this.query(tenantId,"SELECT * FROM prod_inventory_availability WHERE tenant_id=$1 AND product_id=$2 AND inventory_warehouse_id=$3",[tenantId,productId,inventoryWarehouseId]);return r.rows[0]?mapRow<InventoryAvailability>(r.rows[0]):undefined;}
  async upsertInventoryAvailability(v:InventoryAvailability){const r=await this.query(v.tenantId,`INSERT INTO prod_inventory_availability (tenant_id,product_id,inventory_warehouse_id,available_qty,uom,fact_version,source_event_id,source_system,as_of,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (tenant_id,product_id,inventory_warehouse_id) DO UPDATE SET available_qty=EXCLUDED.available_qty,uom=EXCLUDED.uom,fact_version=EXCLUDED.fact_version,source_event_id=EXCLUDED.source_event_id,source_system=EXCLUDED.source_system,as_of=EXCLUDED.as_of,updated_at=EXCLUDED.updated_at WHERE prod_inventory_availability.fact_version < EXCLUDED.fact_version RETURNING (xmax = 0) AS inserted`,[v.tenantId,v.productId,v.inventoryWarehouseId,v.availableQty,v.uom,v.factVersion,v.sourceEventId,v.sourceSystem,v.asOf,v.updatedAt]);if(!r.rowCount)return "STALE" as const;return r.rows[0].inserted?"CREATED" as const:"UPDATED" as const;}
  async getInboxEvent(tenantId:string,consumerName:string,eventId:string){const r=await this.query(tenantId,"SELECT * FROM prod_event_inbox WHERE tenant_id=$1 AND consumer_name=$2 AND event_id=$3",[tenantId,consumerName,eventId]);return r.rows[0]?mapRow<InboxEvent>(r.rows[0]):undefined;}
  async addInboxEvent(v:InboxEvent){const r=await this.query(v.tenantId,`INSERT INTO prod_event_inbox (id,tenant_id,consumer_name,event_id,event_type,event_version,aggregate_id,aggregate_version,status,payload,retry_count,received_at,processed_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12,$13) ON CONFLICT DO NOTHING`,[v.id,v.tenantId,v.consumerName,v.eventId,v.eventType,v.eventVersion,v.aggregateId,v.aggregateVersion,v.status,JSON.stringify(v.payload),v.retryCount,v.receivedAt,v.processedAt]);return r.rowCount===1;}
  async lockSalesOrderIntake(tenantId:string,salesOrderId:string,sourceLineId:string,sourceRevision:number){await this.query(tenantId,"SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",[`${tenantId}:${salesOrderId}:${sourceLineId}:${sourceRevision}`]);}
  async insertSalesOrderIntake(v:SalesOrderIntake){await this.query(v.tenantId,`INSERT INTO prod_sales_order_intake (id,tenant_id,sales_order_id,source_line_id,source_revision,product_id,product_name,ordered_qty,available_qty,shortage_qty,uom,due_date,factory_resource_id,inventory_warehouse_id,inventory_fact_version,decision,demand_id,status,correlation_id,trace_id,created_by,row_version,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)`,[v.id,v.tenantId,v.salesOrderId,v.sourceLineId,v.sourceRevision,v.productId,v.productName,v.orderedQty,v.availableQty,v.shortageQty,v.uom,v.dueDate,v.factoryResourceId,v.inventoryWarehouseId,v.inventoryFactVersion,v.decision,v.demandId,v.status,v.correlationId,v.traceId,v.createdBy,v.version,v.createdAt]);}
  async getSalesOrderIntake(tenantId:string,salesOrderId:string,sourceLineId:string,sourceRevision:number){const r=await this.query(tenantId,"SELECT * FROM prod_sales_order_intake WHERE tenant_id=$1 AND sales_order_id=$2 AND source_line_id=$3 AND source_revision=$4",[tenantId,salesOrderId,sourceLineId,sourceRevision]);return r.rows[0]?mapRow<SalesOrderIntake>(r.rows[0]):undefined;}
}
