package com.meetflow.common;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import java.net.URI;

@RestControllerAdvice
public class GlobalExceptionHandler {
    @ExceptionHandler(NotFoundException.class)
    ProblemDetail notFound(NotFoundException exception) { return problem(HttpStatus.NOT_FOUND, exception.getMessage()); }

    @ExceptionHandler(BusinessException.class)
    ProblemDetail business(BusinessException exception) { return problem(HttpStatus.CONFLICT, exception.getMessage()); }

    @ExceptionHandler(DataIntegrityViolationException.class)
    ProblemDetail duplicate() { return problem(HttpStatus.CONFLICT, "Já existe um registro com estes dados"); }

    @ExceptionHandler(BadCredentialsException.class)
    ProblemDetail credentials() { return problem(HttpStatus.UNAUTHORIZED, "E-mail ou senha inválidos"); }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ProblemDetail validation(MethodArgumentNotValidException exception) {
        String message = exception.getBindingResult().getFieldErrors().stream().findFirst()
                .map(error -> error.getField() + ": " + error.getDefaultMessage()).orElse("Dados inválidos");
        return problem(HttpStatus.BAD_REQUEST, message);
    }

    private ProblemDetail problem(HttpStatus status, String detail) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, detail);
        problem.setType(URI.create("https://meetflow.local/problems/" + status.value()));
        problem.setTitle(status.getReasonPhrase());
        return problem;
    }
}
