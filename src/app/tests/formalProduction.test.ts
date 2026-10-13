import { describe, expect, it } from "vitest";
import { formalProductionJob, formalProductionOrder, formalProductionInspection } from "../../features/production/model/formalProduction";
import { recoverMpsFromPlannedDemand } from "../../features/production/model/productionPlanStatus";
import type { WorkOrderDto, InspectionDto, CompletionDto } from "../../api/production/operations";

const order: WorkOrderDto = {
  id: "WO1", code: "WO-001", productId: "FG1", factoryResourceId: "FAC1", workCenterResourceId: "WC1",
  plannedQty: "10", inputQty: "10", reportedGoodQty: "6", reportedDefectQty: "1", reportedScrapQty: "1",
  postedQty: "0", uom: "PCS", dueDate: "2026-11-30", status: "RELEASED", correlationId: "C1",
  createdBy: "writer", version: 4, updatedAt: "2026-10-13",
};
const inspection: InspectionDto = { id: "QC1", code: "FQC-001", workOrderId: "WO1", sampleQty: "6",
  passedQty: "6", failedQty: "0", status: "PASSED", version: 2, createdAt: "2026-10-13" };
const completion: CompletionDto = { id: "CMP1", code: "CMP-1", workOrderId: "WO1", inspectionId: "QC1",
  qty: "6", uom: "PCS", status: "POSTING", taskId: "TASK1", version: 1, updatedAt: "2026-10-13" };
describe("formal production facts", () => {
  it("keeps released work orders unstarted and restores exact report totals", () => {
    expect(formalProductionOrder(order).status).toBe("已下达");
    expect(formalProductionJob(order)).toMatchObject({ status: "未开工", okQty: 6, ngQty: 1, scrapQty: 1 });
    expect(formalProductionJob({ ...order, status: "IN_PROGRESS" }).status).toBe("进行中");
  });
  it("does not mark pending or failed receipts complete", () => {
    expect(formalProductionInspection(inspection, [order], [completion]).status).toBe("入库处理中");
    expect(formalProductionInspection(inspection, [order], [{ ...completion, status: "FAILED" }]).status).toBe("入库失败");
    expect(formalProductionInspection(inspection, [order], [{ ...completion, status: "POSTED", externalTransactionId: "TX1" }]))
      .toMatchObject({ status: "已入库", stockTx: "TX1", orderId: "WO-001" });
    expect(formalProductionInspection({ ...inspection, status: "DISPOSITION_PENDING", failedQty: "2" }, [order]).status).toBe("待质量处置");
    expect(formalProductionInspection({ ...inspection, status: "REWORKED", failedQty: "2" }, [order], [{ ...completion, status: "POSTED" }]))
      .toMatchObject({ status: "已入库", result: "返工复检已完成" });
    expect(formalProductionInspection({ ...inspection, status: "SCRAPPED", failedQty: "2" }, [order]).result).toBe("已审批报废");
  });
  it("restores schedule and work order links without allowing another work order", () => {
    const demand = { id: "D1", code: "DM1", sourceType: "MANUAL", productId: "FG1", status: "PLANNED",
      mrpTaskId: "M1", scheduleCandidateId: "APS1", workOrderId: "WO1", workOrderCode: "WO-001" };
    const task = { id: "M1", status: "SUCCEEDED", result: { mpsLines: [{ demandId: "D1", plannedQty: "10" }] } };
    expect(recoverMpsFromPlannedDemand(demand, task)).toMatchObject({ status: "已建工单", workOrderId: "WO1" });
  });
});
