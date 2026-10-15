package com.wanshen.platform.supplychain;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.wanshen.platform.storage.JdbcModuleStoreSupport;

import javax.sql.DataSource;
import java.util.Arrays;
import java.util.Comparator;
import java.util.List;
import java.util.Objects;
import java.util.Optional;

public class JdbcSupplyChainStore extends JdbcModuleStoreSupport implements AbstractSupplyChainStore {
    public JdbcSupplyChainStore(DataSource dataSource, ObjectMapper objectMapper) {
        super(dataSource, objectMapper, "supplychain");
    }

    @Override
    public Page<Supplier> suppliers(String tenantId, SupplierFilter filter) {
        return page(documents(tenantId, "supplier", Supplier.class).stream()
                .filter(item -> eq(filter == null ? null : filter.status(), item.status()))
                .filter(item -> eq(filter == null ? null : filter.rating(), item.rating()))
                .filter(item -> eq(filter == null ? null : filter.riskLevel(), item.riskLevel()))
                .filter(item -> eq(filter == null ? null : filter.category(), item.category()))
                .filter(item -> filter == null || filter.admittance() == null || item.admittance() == filter.admittance())
                .filter(item -> eq(filter == null ? null : filter.owner(), item.owner()))
                .filter(item -> search(filter == null ? null : filter.search(),
                        item.supplierNo(), item.name(), item.creditCode(), item.owner()))
                .sorted(Comparator.comparing(Supplier::createdAt).reversed()).toList(),
                filter == null ? null : filter.page(), filter == null ? null : filter.pageSize());
    }
    @Override
    public Optional<Supplier> supplier(String tenantId, String id) {
        return document(tenantId, "supplier", id, Supplier.class);
    }
    @Override
    public Optional<Supplier> supplierByNo(String tenantId, String supplierNo) {
        return documents(tenantId, "supplier", Supplier.class).stream()
                .filter(item -> item.supplierNo().equals(supplierNo)).findFirst();
    }
    @Override
    public void saveSupplier(Supplier value) { putDocument(value.tenantId(), "supplier", value.id(), value); }
    @Override
    public void deleteSupplier(String tenantId, String id) { deleteDocument(tenantId, "supplier", id); }

    @Override
    public Page<Customer> customers(String tenantId, CustomerFilter filter) {
        return page(documents(tenantId, "customer", Customer.class).stream()
                .filter(item -> eq(filter == null ? null : filter.status(), item.status()))
                .filter(item -> eq(filter == null ? null : filter.exposureLevel(), item.exposureLevel()))
                .filter(item -> eq(filter == null ? null : filter.pressureLevel(), item.pressureLevel()))
                .filter(item -> eq(filter == null ? null : filter.industry(), item.industry()))
                .filter(item -> search(filter == null ? null : filter.search(),
                        item.customerNo(), item.name(), item.creditCode(), item.legalRepresentative()))
                .sorted(Comparator.comparing(Customer::createdAt).reversed()).toList(),
                filter == null ? null : filter.page(), filter == null ? null : filter.pageSize());
    }
    @Override
    public Optional<Customer> customer(String tenantId, String id) {
        return document(tenantId, "customer", id, Customer.class);
    }
    @Override
    public Optional<Customer> customerByNo(String tenantId, String customerNo) {
        return documents(tenantId, "customer", Customer.class).stream()
                .filter(item -> item.customerNo().equals(customerNo)).findFirst();
    }
    @Override
    public void saveCustomer(Customer value) { putDocument(value.tenantId(), "customer", value.id(), value); }
    @Override
    public void deleteCustomer(String tenantId, String id) { deleteDocument(tenantId, "customer", id); }

    @Override
    public Page<RiskEvent> riskEvents(String tenantId, RiskFilter filter) {
        return page(documents(tenantId, "riskEvent", RiskEvent.class).stream()
                .filter(item -> eq(filter == null ? null : filter.status(), item.status()))
                .filter(item -> eq(filter == null ? null : filter.riskLevel(), item.riskLevel()))
                .filter(item -> eq(filter == null ? null : filter.companyType(), item.companyType()))
                .filter(item -> eq(filter == null ? null : filter.owner(), item.owner()))
                .filter(item -> search(filter == null ? null : filter.search(),
                        item.riskNo(), item.companyName(), item.riskType(), item.owner()))
                .sorted(Comparator.comparing(RiskEvent::createdAt).reversed()).toList(),
                filter == null ? null : filter.page(), filter == null ? null : filter.pageSize());
    }
    @Override
    public Optional<RiskEvent> riskEvent(String tenantId, String id) {
        return document(tenantId, "riskEvent", id, RiskEvent.class);
    }
    @Override
    public void saveRiskEvent(RiskEvent value) { putDocument(value.tenantId(), "riskEvent", value.id(), value); }
    @Override
    public void deleteRiskEvent(String tenantId, String id) { deleteDocument(tenantId, "riskEvent", id); }

    private boolean eq(String expected, String actual) { return expected == null || expected.equals(actual); }
    private boolean search(String query, String... fields) {
        if (query == null || query.isBlank()) return true;
        return Arrays.stream(fields).filter(Objects::nonNull)
                .anyMatch(field -> field.toLowerCase().contains(query.toLowerCase()));
    }
    private <T> Page<T> page(List<T> values, Integer page, Integer pageSize) {
        int safePage = page == null || page < 1 ? 1 : page;
        int safeSize = pageSize == null || pageSize < 1 ? 20 : pageSize;
        int from = Math.min((safePage - 1) * safeSize, values.size());
        int to = Math.min(from + safeSize, values.size());
        return new Page<>(List.copyOf(values.subList(from, to)), values.size());
    }
}
