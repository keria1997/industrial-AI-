package com.wanshen.platform.fulfillment;

import java.util.Set;

final class InventoryUnits {
    private static final Set<String> SINGLE_ITEM_UNITS = Set.of("PCS", "件", "台", "个");

    private InventoryUnits() {}

    static String canonical(String unit) {
        return SINGLE_ITEM_UNITS.contains(unit) ? "PCS" : unit;
    }

    static boolean compatible(String left, String right) {
        return left != null && !left.isBlank() && right != null && !right.isBlank()
                && canonical(left).equals(canonical(right));
    }
}
