package com.capvault.backend.config;

import java.util.LinkedHashMap;
import java.util.Map;
import com.capvault.backend.auth.GoogleIdentityUnavailableException;
import com.capvault.backend.auth.InvalidGoogleCredentialException;


import jakarta.validation.ConstraintViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.validation.FieldError;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice
public class ApiExceptionHandler {

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ResponseEntity<ApiErrorResponse> handleValidation(MethodArgumentNotValidException exception) {
        Map<String, String> fieldErrors = new LinkedHashMap<>();
        for (FieldError fieldError : exception.getBindingResult().getFieldErrors()) {
            fieldErrors.put(fieldError.getField(), fieldError.getDefaultMessage());
        }
        return ResponseEntity.badRequest().body(ApiErrorResponse.withFields(
            HttpStatus.BAD_REQUEST.value(),
            "Validation failed",
            fieldErrors
        ));
    }

    @ExceptionHandler(ConstraintViolationException.class)
    ResponseEntity<ApiErrorResponse> handleConstraintViolation(ConstraintViolationException exception) {
        return ResponseEntity.badRequest().body(ApiErrorResponse.of(
            HttpStatus.BAD_REQUEST.value(),
            exception.getMessage()
        ));
    }

    @ExceptionHandler(IllegalArgumentException.class)
    ResponseEntity<ApiErrorResponse> handleIllegalArgument(IllegalArgumentException exception) {
        return ResponseEntity.badRequest().body(ApiErrorResponse.of(
            HttpStatus.BAD_REQUEST.value(),
            exception.getMessage()
        ));
    }

    @ExceptionHandler(InvalidGoogleCredentialException.class)
    ResponseEntity<ApiErrorResponse> handleInvalidGoogleCredential(InvalidGoogleCredentialException exception) {
        return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(ApiErrorResponse.of(
            HttpStatus.UNAUTHORIZED.value(),
            exception.getMessage()
        ));
    }

    @ExceptionHandler(GoogleIdentityUnavailableException.class)
    ResponseEntity<ApiErrorResponse> handleGoogleIdentityUnavailable(GoogleIdentityUnavailableException exception) {
        return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(ApiErrorResponse.of(
            HttpStatus.SERVICE_UNAVAILABLE.value(),
            exception.getMessage()
        ));
    }
}
