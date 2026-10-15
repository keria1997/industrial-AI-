package com.wanshen.platform.repository;

import com.wanshen.platform.entity.SalesQuote;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface SalesQuoteRepository extends JpaRepository<SalesQuote, UUID> {

    Optional<SalesQuote> findByTenantIdAndQuoteNo(String tenantId, String quoteNo);

    List<SalesQuote> findByTenantIdAndStatusIn(String tenantId, List<String> statuses);

    @Query("SELECT q FROM SalesQuote q WHERE q.tenantId = :tenantId " +
           "AND q.status IN ('ACTIVE','EXPIRING') " +
           "AND q.validUntil >= :today")
    List<SalesQuote> findActiveQuotes(@Param("tenantId") String tenantId, @Param("today") LocalDate today);

    long countByTenantIdAndStatusIn(String tenantId, List<String> statuses);

    List<SalesQuote> findByTenantIdOrderByUpdatedAtDesc(String tenantId);
}
