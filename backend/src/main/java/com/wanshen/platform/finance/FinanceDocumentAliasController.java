package com.wanshen.platform.finance;

import com.fasterxml.jackson.databind.JsonNode;
import com.wanshen.platform.web.RequestContextService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * PRD path alias for finance document reversal. The implementation remains in FinanceController.
 */
@RestController
@RequestMapping("/api/v1/finance-documents")
@ConditionalOnProperty(value = "app.finance.native-enabled", havingValue = "true")
public class FinanceDocumentAliasController {
    private final FinanceController financeController;
    private final RequestContextService contexts;

    public FinanceDocumentAliasController(
            FinanceController financeController, RequestContextService contexts
    ) {
        this.financeController = financeController;
        this.contexts = contexts;
    }

    @PostMapping("/{id}/reverse")
    public ResponseEntity<?> reverse(
            @PathVariable String id,
            @RequestBody JsonNode input,
            HttpServletRequest request
    ) {
        return financeController.reverseFinanceDocument(id, input, request);
    }
}
