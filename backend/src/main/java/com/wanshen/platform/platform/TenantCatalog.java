package com.wanshen.platform.platform;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

public final class TenantCatalog {
    public static final String ADMIN_EMPLOYEE_ID = "EMP-ADMIN";
    public static final String ADMIN_POSITION_ID = "POS-ADMIN";
    public static final String ADMIN_ACCOUNT_ID = "ACC-ADMIN";
    public static final String ADMIN_ROLE_ID = "ROLE-ADMIN";
    public static final String ROOT_ORG_ID = "ORG-ROOT";
    public static final String FACTORY_ORG_ID = "ORG-FAC-01";

    private static final List<String[]> PERMISSIONS = List.of(
            perm("PERM-PLATFORM", "platform", "平台管理菜单", "平台管理", "menu", "normal"),
            perm("PERM-ORG-VIEW", "platform.org.view", "组织架构查看", "平台管理", "page", "normal"),
            perm("PERM-ORG-MANAGE", "platform.org.manage", "组织架构维护", "平台管理", "button", "sensitive"),
            perm("PERM-RESOURCE-MANAGE", "platform.resource.manage", "企业资源维护", "平台管理", "button", "sensitive"),
            perm("PERM-POSITION-MANAGE", "platform.position.manage", "岗位维护", "平台管理", "button", "sensitive"),
            perm("PERM-EMPLOYEE-MANAGE", "platform.employee.manage", "员工维护", "平台管理", "button", "sensitive"),
            perm("PERM-ACCOUNT-MANAGE", "platform.account.manage", "账号维护", "平台管理", "button", "sensitive"),
            perm("PERM-ACCOUNT-DISABLE", "platform.account.disable", "账号停用", "平台管理", "api", "critical"),
            perm("PERM-ROLE-MANAGE", "platform.role.manage", "角色维护", "平台管理", "button", "sensitive"),
            perm("PERM-ROLE-GRANT", "platform.role.grant", "角色授权", "平台管理", "api", "critical"),
            perm("PERM-PREVIEW", "platform.permission.preview", "权限预览", "平台管理", "button", "sensitive"),
            perm("PERM-ACTOR-VIEW", "platform.actor.view", "当前用户权限查看", "平台管理", "page", "normal"),
            perm("PERM-ADAPTER-MANAGE", "platform.adapter.manage", "权限适配器维护", "平台管理", "button", "sensitive"),
            perm("PERM-ADAPTER", "platform.adapter.sync", "旧ERP权限同步", "平台管理", "api", "critical"),
            perm("PERM-APPROVAL-MANAGE", "platform.approval.manage", "审批规则维护", "平台管理", "button", "sensitive"),
            perm("PERM-DICTIONARY-MANAGE", "platform.dictionary.manage", "字典维护", "平台管理", "button", "normal"),
            perm("PERM-PARAMETER-MANAGE", "platform.parameter.manage", "系统参数维护", "平台管理", "button", "sensitive"),
            perm("PERM-SECURITY-VIEW", "platform.security.view", "安全参数查看", "平台管理", "page", "sensitive"),
            perm("PERM-CAPABILITY-MANAGE", "platform.capability.manage", "能力开关维护", "平台管理", "button", "critical"),
            perm("PERM-SESSION-REVOKE", "platform.session.revoke", "会话撤销", "平台管理", "api", "critical"),
            perm("PERM-AUDIT", "platform.audit.view", "审计日志查看", "平台管理", "page", "sensitive"),
            perm("PERM-AUDIT-EXPORT", "platform.audit.export", "审计日志导出", "平台管理", "export", "critical"),
            perm("PERM-MPS-MENU", "production.mps.view", "主生产计划", "生产管理", "menu", "sensitive"),
            perm("PERM-MPS", "production.mps.release", "主生产计划下达", "生产管理", "api", "critical"),
            perm("PERM-MRP", "production.mps.calcMrp", "MRP展算", "生产管理", "button", "sensitive"),
            perm("PERM-PROD-VIEW", "production.view", "生产管理查看", "生产管理", "menu", "normal"),
            perm("PERM-PROD-DEMAND-READ", "production.demand.read", "生产需求读取", "生产管理", "api", "normal"),
            perm("PERM-PROD-WORK-ORDER-READ", "production.work-order.read", "生产工单读取", "生产管理", "api", "normal"),
            perm("PERM-PROD-TASK-READ", "production.task.read", "生产任务读取", "生产管理", "api", "normal"),
            perm("PERM-PROD-QUALITY-READ", "production.quality.read", "生产检验读取", "生产管理", "api", "normal"),
            perm("PERM-PROD-COMPLETION-READ", "production.completion.read", "生产完工读取", "生产管理", "api", "normal"),
            perm("PERM-PROD-CLOSE-READ", "production.close.read", "生产结案读取", "生产管理", "api", "normal"),
            perm("PERM-PROD-DASHBOARD-READ", "production.dashboard.read", "生产驾驶舱读取", "生产管理", "api", "normal"),
            perm("PERM-PROD-MASTER", "production.master.manage", "生产主数据维护", "生产管理", "button", "sensitive"),
            perm("PERM-PROD-DEMAND", "production.demand.manage", "生产需求维护", "生产管理", "button", "sensitive"),
            perm("PERM-PROD-DEMAND-REVIEW", "production.demand.review", "生产需求校验", "生产管理", "api", "sensitive"),
            perm("PERM-PROD-DEMAND-APPROVE", "production.demand.approve", "生产需求审批", "生产管理", "api", "critical"),
            perm("PERM-PROD-DEMAND-CLAIM", "production.demand.claim", "生产需求接收", "生产管理", "api", "sensitive"),
            perm("PERM-PROD-MRP-RUN", "production.mrp.run", "MRP展算执行", "生产管理", "api", "sensitive"),
            perm("PERM-PROD-APS-RUN", "production.aps.run", "APS排程执行", "生产管理", "api", "sensitive"),
            perm("PERM-PROD-PLAN", "production.plan.manage", "生产计划维护", "生产管理", "button", "sensitive"),
            perm("PERM-PROD-APS", "production.aps.manage", "APS排产维护", "生产管理", "button", "sensitive"),
            perm("PERM-PROD-KITTING", "production.kitting.manage", "齐套与投料维护", "生产管理", "button", "sensitive"),
            perm("PERM-PROD-EXECUTION", "production.execution.manage", "车间执行维护", "生产管理", "button", "sensitive"),
            perm("PERM-PROD-QUALITY", "production.quality.manage", "生产质量维护", "生产管理", "button", "sensitive"),
            perm("PERM-PROD-COMPLETION", "production.completion.manage", "完工结案维护", "生产管理", "button", "critical"),
            perm("PERM-PROD-TASKS", "production.tasks.view", "生产任务中心查看", "生产管理", "page", "sensitive"),
            perm("PERM-STOCK-EXPORT", "inventory.stock.export", "库存导出", "库存管理", "export", "sensitive"),
            perm("PERM-INVENTORY-IMPORT", "inventory.availability.import", "WMS库存快照导入", "库存管理", "api", "critical"),
            perm("PERM-COST", "finance.cost.costAmount", "成本金额", "财务管理", "field", "critical"),
            perm("PERM-RISK", "sales.customer.riskLevel", "客户风险等级", "销售管理", "field", "sensitive"),
            perm("PERM-SALES-ORDER-SELF-APPROVE", "sales.order.review.self-approve", "销售订单本人审批", "销售管理", "api", "critical"),
            perm("PERM-SUP-ATT", "purchase.supplier.attachments", "供应商资质附件", "采购管理", "field", "sensitive"),
            perm("PERM-AI-RISK", "ai.customerRisk.query", "AI客户风险查询", "AI助手", "ai", "critical"),
            perm("PERM-AI-IMPORT", "ai.import.use", "AI主数据导入", "AI助手", "api", "sensitive"),
            perm("PERM-INV-WH-CREATE", "inventory.warehouse.create", "仓库维护", "库存管理", "button", "sensitive"),
            perm("PERM-INV-PROD-CREATE", "inventory.product.create", "产品维护", "库存管理", "button", "sensitive"),
            perm("PERM-INV-MAT-CREATE", "inventory.material.create", "物料维护", "库存管理", "button", "sensitive"),
            perm("PERM-SC-CUST-CREATE", "sc.customer.create", "客户维护", "销售管理", "button", "sensitive"),
            perm("PERM-SC-SUP-CREATE", "sc.supplier.create", "供应商维护", "采购管理", "button", "sensitive"),
            perm("PERM-WORKBENCH", "workbench.dashboard.read", "工作台查看", "工作台", "page", "normal"),
            perm("PERM-HR-EMPLOYEE-READ", "hr.employee.read", "员工查看", "人员管理", "page", "normal"),
            perm("PERM-HR-EMPLOYEE-CREATE", "hr.employee.create", "员工新增", "人员管理", "button", "sensitive"),
            perm("PERM-HR-EMPLOYEE-UPDATE", "hr.employee.update", "员工维护", "人员管理", "button", "sensitive"),
            perm("PERM-HR-EMPLOYEE-DELETE", "hr.employee.delete", "员工删除", "人员管理", "button", "critical"),
            perm("PERM-HR-ATTENDANCE-READ", "hr.attendance.read", "考勤查看", "人员管理", "page", "normal"),
            perm("PERM-HR-ATTENDANCE-CREATE", "hr.attendance.create", "考勤登记", "人员管理", "button", "sensitive"),
            perm("PERM-HR-ATTENDANCE-UPDATE", "hr.attendance.update", "考勤维护", "人员管理", "button", "sensitive"),
            perm("PERM-HR-SKILL-READ", "hr.skill.read", "技能证书查看", "人员管理", "page", "normal"),
            perm("PERM-HR-SKILL-CREATE", "hr.skill.create", "技能证书新增", "人员管理", "button", "sensitive"),
            perm("PERM-HR-SKILL-UPDATE", "hr.skill.update", "技能证书维护", "人员管理", "button", "sensitive"),
            perm("PERM-HR-SKILL-RENEW", "hr.skill.renew", "技能证书续期", "人员管理", "button", "sensitive")
    );

    private TenantCatalog() {}

    public static List<Map<String, Object>> permissions(String tenantId, String timestamp) {
        return PERMISSIONS.stream().map(row -> document(tenantId, timestamp,
                "id", row[0], "code", row[1], "name", row[2], "module", row[3], "type", row[4], "risk", row[5]
        )).toList();
    }

    public static List<Map<String, Object>> roles(String tenantId, String timestamp) {
        List<Map<String, Object>> result = new ArrayList<>();
        result.add(document(tenantId, timestamp, "id", ADMIN_ROLE_ID, "code", "TENANT_ADMIN",
                "name", "租户系统管理员", "description", "管理当前租户平台底座与全部权限",
                "dataScope", "tenant_all", "scopeValues", List.of(), "status", "enabled"));
        result.add(document(tenantId, timestamp, "id", "ROLE-MFG", "code", "PRODUCTION_DIRECTOR",
                "name", "生产主管", "description", "生产需求、计划、展算与工单管理",
                "dataScope", "factory_set", "scopeValues", List.of(FACTORY_ORG_ID), "status", "enabled"));
        result.add(document(tenantId, timestamp, "id", "ROLE-WMS", "code", "WAREHOUSE_ADMIN",
                "name", "仓库管理员", "description", "授权仓库的出入库与库存操作",
                "dataScope", "warehouse_set", "scopeValues", List.of(), "status", "enabled"));
        result.add(document(tenantId, timestamp, "id", "ROLE-SALE", "code", "SALE_STAFF",
                "name", "销售专员", "description", "本人客户、报价和销售订单",
                "dataScope", "customer_owner", "scopeValues", List.of(), "status", "enabled"));
        result.add(document(tenantId, timestamp, "id", "ROLE-PUR", "code", "PURCHASE_STAFF",
                "name", "采购专员", "description", "本人供应商与采购业务",
                "dataScope", "supplier_buyer", "scopeValues", List.of(), "status", "enabled"));
        result.add(document(tenantId, timestamp, "id", "ROLE-FIN", "code", "FINANCE_STAFF",
                "name", "财务专员", "description", "应收应付、凭证和授权金额字段",
                "dataScope", "org_tree", "scopeValues", List.of(), "status", "enabled"));
        result.add(document(tenantId, timestamp, "id", "ROLE-SHOP", "code", "PRODUCTION_WORKSHOP",
                "name", "车间执行人员", "description", "授权工厂的工单执行、报工、质量与完工",
                "dataScope", "factory_set", "scopeValues", List.of(FACTORY_ORG_ID), "status", "enabled"));
        result.add(document(tenantId, timestamp, "id", "ROLE-PROD-VIEW", "code", "PRODUCTION_VIEWER",
                "name", "生产只读人员", "description", "只查看授权工厂的生产业务数据",
                "dataScope", "factory_set", "scopeValues", List.of(FACTORY_ORG_ID), "status", "enabled"));
        result.add(document(tenantId, timestamp, "id", "ROLE-HR", "code", "HR_SPECIALIST",
                "name", "人事专员", "description", "管理员工、考勤与技能证书",
                "dataScope", "tenant_all", "scopeValues", List.of(), "status", "enabled"));
        return result;
    }

    public static List<Map.Entry<String, List<Map<String, Object>>>> roleGrantGroups(
            String tenantId, List<Map<String, Object>> permissions, String timestamp
    ) {
        List<Map.Entry<String, List<Map<String, Object>>>> groups = new ArrayList<>();
        groups.add(Map.entry(ADMIN_ROLE_ID, permissions.stream()
                .map(permission -> grant(tenantId, ADMIN_ROLE_ID, (String) permission.get("id"), "allow", null, timestamp))
                .toList()));
        groups.add(Map.entry("ROLE-MFG", List.of(
                grant(tenantId, "ROLE-MFG", "PERM-MPS-MENU", "allow", null, timestamp),
                grant(tenantId, "ROLE-MFG", "PERM-MPS", "allow", null, timestamp),
                grant(tenantId, "ROLE-MFG", "PERM-MRP", "allow", null, timestamp),
                grant(tenantId, "ROLE-MFG", "PERM-PROD-DEMAND-REVIEW", "allow", null, timestamp),
                grant(tenantId, "ROLE-MFG", "PERM-PROD-DEMAND-APPROVE", "allow", null, timestamp),
                grant(tenantId, "ROLE-MFG", "PERM-PROD-DEMAND-CLAIM", "allow", null, timestamp),
                grant(tenantId, "ROLE-MFG", "PERM-PROD-MRP-RUN", "allow", null, timestamp),
                grant(tenantId, "ROLE-MFG", "PERM-PROD-APS-RUN", "allow", null, timestamp),
                grant(tenantId, "ROLE-MFG", "PERM-COST", "deny", "hidden", timestamp),
                grant(tenantId, "ROLE-MFG", "PERM-AI-IMPORT", "allow", null, timestamp),
                grant(tenantId, "ROLE-MFG", "PERM-INV-PROD-CREATE", "allow", null, timestamp),
                grant(tenantId, "ROLE-MFG", "PERM-INV-MAT-CREATE", "allow", null, timestamp),
                grant(tenantId, "ROLE-MFG", "PERM-PROD-VIEW", "allow", null, timestamp),
                grant(tenantId, "ROLE-MFG", "PERM-PROD-MASTER", "allow", null, timestamp),
                grant(tenantId, "ROLE-MFG", "PERM-PROD-DEMAND", "allow", null, timestamp),
                grant(tenantId, "ROLE-MFG", "PERM-PROD-PLAN", "allow", null, timestamp),
                grant(tenantId, "ROLE-MFG", "PERM-PROD-APS", "allow", null, timestamp),
                grant(tenantId, "ROLE-MFG", "PERM-PROD-KITTING", "allow", null, timestamp),
                grant(tenantId, "ROLE-MFG", "PERM-PROD-EXECUTION", "allow", null, timestamp),
                grant(tenantId, "ROLE-MFG", "PERM-PROD-QUALITY", "allow", null, timestamp),
                grant(tenantId, "ROLE-MFG", "PERM-PROD-COMPLETION", "allow", null, timestamp)
        )));
        groups.add(Map.entry("ROLE-SHOP", List.of("PERM-PROD-VIEW", "PERM-PROD-EXECUTION",
                "PERM-PROD-QUALITY", "PERM-PROD-COMPLETION").stream()
                .map(id -> grant(tenantId, "ROLE-SHOP", id, "allow", null, timestamp)).toList()));
        groups.add(Map.entry("ROLE-PROD-VIEW", List.of("PERM-PROD-VIEW").stream()
                .map(id -> grant(tenantId, "ROLE-PROD-VIEW", id, "allow", null, timestamp)).toList()));
        groups.add(Map.entry("ROLE-WMS", List.of(
                grant(tenantId, "ROLE-WMS", "PERM-STOCK-EXPORT", "allow", null, timestamp),
                grant(tenantId, "ROLE-WMS", "PERM-PROD-VIEW", "allow", null, timestamp),
                grant(tenantId, "ROLE-WMS", "PERM-PROD-KITTING", "allow", null, timestamp),
                grant(tenantId, "ROLE-WMS", "PERM-AI-IMPORT", "allow", null, timestamp),
                grant(tenantId, "ROLE-WMS", "PERM-INVENTORY-IMPORT", "allow", null, timestamp),
                grant(tenantId, "ROLE-WMS", "PERM-INV-WH-CREATE", "allow", null, timestamp),
                grant(tenantId, "ROLE-WMS", "PERM-INV-MAT-CREATE", "allow", null, timestamp)
        )));
        groups.add(Map.entry("ROLE-SALE", List.of(
                grant(tenantId, "ROLE-SALE", "PERM-RISK", "allow", "masked", timestamp),
                grant(tenantId, "ROLE-SALE", "PERM-AI-IMPORT", "allow", null, timestamp),
                grant(tenantId, "ROLE-SALE", "PERM-SC-CUST-CREATE", "allow", null, timestamp)
        )));
        groups.add(Map.entry("ROLE-PUR", List.of(
                grant(tenantId, "ROLE-PUR", "PERM-SUP-ATT", "allow", "visible", timestamp),
                grant(tenantId, "ROLE-PUR", "PERM-AI-IMPORT", "allow", null, timestamp),
                grant(tenantId, "ROLE-PUR", "PERM-INV-MAT-CREATE", "allow", null, timestamp),
                grant(tenantId, "ROLE-PUR", "PERM-SC-SUP-CREATE", "allow", null, timestamp)
        )));
        groups.add(Map.entry("ROLE-FIN", List.of(
                grant(tenantId, "ROLE-FIN", "PERM-COST", "allow", "visible", timestamp)
        )));
        List<String> hrPermissionIds = permissions.stream()
                .filter(permission -> {
                    String module = String.valueOf(permission.get("module"));
                    String code = String.valueOf(permission.get("code"));
                    return "人员管理".equals(module) || "工作台".equals(module) || code.startsWith("hr.");
                })
                .map(permission -> (String) permission.get("id"))
                .toList();
        groups.add(Map.entry("ROLE-HR", hrPermissionIds.stream()
                .map(id -> grant(tenantId, "ROLE-HR", id, "allow", null, timestamp))
                .toList()));
        return groups;
    }

    public static List<Map<String, Object>> orgUnits(String tenantId, String tenantName, String timestamp) {
        return List.of(
                document(tenantId, timestamp, "id", ROOT_ORG_ID, "code", "ROOT", "name", tenantName,
                        "type", "company", "parentId", null, "managerEmployeeId", ADMIN_EMPLOYEE_ID, "status", "enabled"),
                document(tenantId, timestamp, "id", FACTORY_ORG_ID, "code", "FAC-01", "name", "一号工厂",
                        "type", "factory", "parentId", ROOT_ORG_ID, "managerEmployeeId", ADMIN_EMPLOYEE_ID, "status", "enabled")
        );
    }

    public static List<Map<String, Object>> capabilities(String tenantId, String timestamp) {
        List<Map<String, Object>> result = new ArrayList<>();
        for (String[] row : new String[][]{
                {"sales", "销售管理", "不限"}, {"production", "生产管理", "不限"},
                {"inventory", "库存管理", "不限"}, {"purchase", "采购管理", "不限"},
                {"finance", "财务管理", "不限"}, {"messageCenter", "消息中心", "20万条/月"},
                {"aiAssistant", "AI助手", "5000次/月"}
        }) {
            Map<String, Object> value = document(tenantId, timestamp, "id", row[0], "code", row[0],
                    "name", row[1], "enabled", true, "quota", row[2], "used", "0");
            value.remove("createdAt");
            result.add(value);
        }
        return result;
    }

    public static List<Map<String, Object>> dictionaries(String tenantId, String timestamp) {
        return List.of(
                document(tenantId, timestamp, "id", "DICT-ORG-COMPANY", "category", "组织类型", "code", "company", "name", "公司", "status", "enabled"),
                document(tenantId, timestamp, "id", "DICT-ORG-DEPARTMENT", "category", "组织类型", "code", "department", "name", "部门", "status", "enabled"),
                document(tenantId, timestamp, "id", "DICT-WH-RAW", "category", "仓库类型", "code", "raw_material", "name", "原材料仓", "status", "enabled"),
                document(tenantId, timestamp, "id", "DICT-WH-LINE", "category", "仓库类型", "code", "line_side", "name", "线边仓", "status", "enabled"),
                document(tenantId, timestamp, "id", "DICT-ACC-LOCKED", "category", "账号状态", "code", "locked", "name", "锁定", "status", "enabled")
        );
    }

    public static List<Map<String, Object>> parameters(String tenantId, String timestamp) {
        return List.of(
                document(tenantId, timestamp, "id", "PAR-LOGIN-FAILURES", "code", "security.login.maxFailures", "name", "登录失败锁定次数", "value", "5", "valueType", "integer", "effectiveMode", "immediate"),
                document(tenantId, timestamp, "id", "PAR-SESSION-HOURS", "code", "security.session.hours", "name", "会话有效期（小时）", "value", "8", "valueType", "integer", "effectiveMode", "next_login"),
                document(tenantId, timestamp, "id", "PAR-PASSWORD-MIN", "code", "security.password.minLength", "name", "密码最小长度", "value", "8", "valueType", "integer", "effectiveMode", "immediate"),
                document(tenantId, timestamp, "id", "PAR-APPROVAL-TIMEOUT", "code", "approval.timeout.hours", "name", "审批超时提醒（小时）", "value", "2", "valueType", "integer", "effectiveMode", "immediate"),
                document(tenantId, timestamp, "id", "PAR-SUPPLIER-ATT", "code", "supplier.attachment.required", "name", "供应商资质默认必填", "value", "false", "valueType", "boolean", "effectiveMode", "immediate")
        );
    }

    public static Map<String, Object> tenant(String tenantId, String tenantName, String timestamp) {
        Map<String, Object> value = document(tenantId, timestamp, "id", tenantId, "code", tenantId.replaceFirst("^TENANT-", ""),
                "name", tenantName, "edition", "标准版", "status", "running",
                "bootstrapOwnerAccountId", ADMIN_ACCOUNT_ID, "formalAdminAccountId", ADMIN_ACCOUNT_ID,
                "expireAt", "2099-12-31");
        value.remove("tenantId");
        return value;
    }

    private static String[] perm(String id, String code, String name, String module, String type, String risk) {
        return new String[]{id, code, name, module, type, risk};
    }

    private static Map<String, Object> grant(
            String tenantId, String roleId, String permissionId, String effect, String fieldMode, String timestamp
    ) {
        Map<String, Object> value = new LinkedHashMap<>();
        value.put("roleId", roleId); value.put("tenantId", tenantId); value.put("permissionId", permissionId);
        value.put("effect", effect);
        if (fieldMode != null) value.put("fieldMode", fieldMode);
        value.put("version", 1); value.put("updatedAt", timestamp);
        return value;
    }

    private static Map<String, Object> document(
            String tenantId, String timestamp, Object... pairs
    ) {
        Map<String, Object> value = new LinkedHashMap<>();
        for (int index = 0; index < pairs.length; index += 2) value.put((String) pairs[index], pairs[index + 1]);
        value.put("tenantId", tenantId); value.put("version", 1);
        if (!value.containsKey("updatedAt")) value.put("updatedAt", timestamp);
        if (!value.containsKey("createdAt")) value.put("createdAt", timestamp);
        return value;
    }
}
