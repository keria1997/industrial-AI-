package com.wanshen.platform.service;

import com.wanshen.platform.BusinessLogUtil;
import com.wanshen.platform.common.enums.PaymentDirection;
import com.wanshen.platform.entity.FinancePayable;
import com.wanshen.platform.entity.FinanceReceivable;
import com.wanshen.platform.entity.Payment;
import com.wanshen.platform.finance.dto.CreatePaymentRequest;
import com.wanshen.platform.finance.dto.SettlementRequest;
import com.wanshen.platform.repository.FinancePayableRepository;
import com.wanshen.platform.repository.FinanceReceivableRepository;
import com.wanshen.platform.repository.PaymentRepository;
import com.wanshen.platform.web.ApiException;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

/**
 * 财务收付款服务（JPA 版本）
 *
 * <p>调用链路: Controller → FinancePaymentService → PaymentRepository → PostgreSQL
 *
 * <p>核心操作: 登记收付款 → 确认 → AR/AP 状态推进
 * <p>AR 状态机: OPEN → PARTIALLY_SETTLED → SETTLED
 * <p>AP 状态机: draft → pending → done
 */
@Service
@Slf4j
@RequiredArgsConstructor
public class FinancePaymentService {

    private final PaymentRepository paymentRepository;
    private final FinanceReceivableRepository receivableRepository;
    private final FinancePayableRepository payableRepository;

    /**
     * 登记收付款
     */
    @Transactional
    public Payment registerPayment(String tenantId, String actorId, CreatePaymentRequest request) {
        Payment payment = new Payment();
        payment.setTenantId(tenantId);
        payment.setDocNo(generateDocNo(request.direction()));
        payment.setDirection(request.direction());

        if (PaymentDirection.IN.name().equals(request.direction()) || "INBOUND".equals(request.direction())) {
            if (request.receivableId() == null || request.receivableId().isBlank()) {
                throw new ApiException(400, "FIN_400_INVALID_ARGUMENT", "收款必须关联应收单", "传入 receivableId");
            }
            UUID receivableId = UUID.fromString(request.receivableId());
            FinanceReceivable ar = receivableRepository.findById(receivableId)
                    .orElseThrow(() -> new ApiException(404, "FIN_404_NOT_FOUND", "应收单不存在", "检查 receivableId"));
            if ("SETTLED".equals(ar.getStatus()) || "REVERSED".equals(ar.getStatus())) {
                throw new ApiException(409, "FIN_409_INVALID_STATUS", "应收单当前状态不允许收款", "状态: " + ar.getStatus());
            }
            payment.setReceivableId(receivableId);
            payment.setCounterpartyId(ar.getCustomerId());
            payment.setCounterpartyName(ar.getCustomerName());
        }

        if (PaymentDirection.OUT.name().equals(request.direction()) || "OUTBOUND".equals(request.direction())) {
            if (request.payableId() == null || request.payableId().isBlank()) {
                throw new ApiException(400, "FIN_400_INVALID_ARGUMENT", "付款必须关联应付单", "传入 payableId");
            }
            UUID payableId = UUID.fromString(request.payableId());
            FinancePayable ap = payableRepository.findById(payableId)
                    .orElseThrow(() -> new ApiException(404, "FIN_404_NOT_FOUND", "应付单不存在", "检查 payableId"));
            if ("done".equals(ap.getStatus()) || "void".equals(ap.getStatus())) {
                throw new ApiException(409, "FIN_409_INVALID_STATUS", "应付单当前状态不允许付款", "状态: " + ap.getStatus());
            }
            payment.setPayableId(payableId);
            payment.setCounterpartyId(ap.getSupplierId());
            payment.setCounterpartyName(ap.getSupplierName());
        }

        payment.setCurrency(request.currency() != null ? request.currency() : "CNY");
        payment.setAmount(request.amount());
        payment.setPaymentMethod(request.paymentMethod());
        payment.setPaymentDate(LocalDate.now());
        payment.setBankAccount("");
        payment.setReferenceNo(request.referenceNo() != null ? request.referenceNo() : "");
        payment.setStatus("pending");
        payment.setRemark(request.remark() != null ? request.remark() : "");
        payment.setCreatedBy(actorId);

        Payment saved = paymentRepository.save(payment);

        BusinessLogUtil.info("财务管理", "登记收付款", saved.getDocNo(),
                "方向:" + saved.getDirection() + " 金额:" + saved.getAmount());
        return saved;
    }

    /**
     * 确认收付款（推进 AR/AP 状态）
     */
    @Transactional
    public Payment confirmPayment(String tenantId, UUID paymentId) {
        Payment payment = paymentRepository.findById(paymentId)
                .orElseThrow(() -> new ApiException(404, "FIN_404_NOT_FOUND", "收付款单不存在", "检查ID"));

        if (!"pending".equals(payment.getStatus())) {
            throw new ApiException(409, "FIN_409_INVALID_STATUS", "收付款单当前状态不允许确认", "状态: " + payment.getStatus());
        }

        payment.setStatus("done");
        Payment saved = paymentRepository.save(payment);

        // 推进 AR 状态
        if (saved.getReceivableId() != null) {
            receivableRepository.findById(saved.getReceivableId()).ifPresent(ar -> {
                ar.setReceivedAmount(ar.getReceivedAmount().add(saved.getAmount()));
                ar.setOutstandingAmount(ar.getTotalAmount().subtract(ar.getReceivedAmount()));
                if (ar.getOutstandingAmount().compareTo(BigDecimal.ZERO) <= 0) {
                    ar.setStatus("SETTLED");
                } else {
                    ar.setStatus("PARTIALLY_SETTLED");
                }
                receivableRepository.save(ar);
            });
        }

        // 推进 AP 状态
        if (saved.getPayableId() != null) {
            payableRepository.findById(saved.getPayableId()).ifPresent(ap -> {
                ap.setPaidAmount(ap.getPaidAmount().add(saved.getAmount()));
                ap.setOutstandingAmount(ap.getTotalAmount().subtract(ap.getPaidAmount()));
                if (ap.getOutstandingAmount().compareTo(BigDecimal.ZERO) <= 0) {
                    ap.setStatus("done");
                }
                payableRepository.save(ap);
            });
        }

        BusinessLogUtil.info("财务管理", "确认收付款", saved.getDocNo(), "金额:" + saved.getAmount());
        return saved;
    }

    /**
     * 查询租户全部收付款记录
     */
    @Transactional(readOnly = true)
    public List<Payment> findAll(String tenantId) {
        return paymentRepository.findByTenantIdOrderByCreatedAtDesc(tenantId);
    }

    private String generateDocNo(String direction) {
        String prefix = PaymentDirection.IN.getDisplayName().equals(direction) || "INBOUND".equals(direction) ? "RECEIPT" : "PAYMENT";
        return prefix + "-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase();
    }
}
