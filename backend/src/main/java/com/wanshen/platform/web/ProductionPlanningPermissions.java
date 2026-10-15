package com.wanshen.platform.web;

import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/** The MPS menu grants its planning workflow; explicit action denials still take precedence. */
public final class ProductionPlanningPermissions {
    public static final String MENU = "production.mps.view";
    public static final Set<String> ACTIONS = Set.of(
            MENU, "production.demand.read", "production.demand.create",
            "production.demand.review", "production.demand.approve", "production.demand.claim",
            "production.demandPool.createMps", "production.mrp.run", "production.aps.run",
            "production.work-order.create", "production.task.read");
    public static final Set<String> READ_ACTIONS = Set.of(
            "production.demand.read", "production.work-order.read", "production.task.read",
            "production.quality.read", "production.completion.read", "production.close.read", "production.dashboard.read");

    private ProductionPlanningPermissions() {}

    public static List<String> expand(Collection<String> allowed, Collection<String> denied) {
        var result = new LinkedHashSet<>(allowed);
        if (result.contains("production.view") && !denied.contains("production.view")) result.addAll(READ_ACTIONS);
        if (result.contains("production.tasks.view") && !denied.contains("production.tasks.view")) result.add("production.task.read");
        if (result.contains(MENU) && !denied.contains(MENU)) result.addAll(ACTIONS);
        result.removeAll(denied);
        return List.copyOf(result);
    }
}
