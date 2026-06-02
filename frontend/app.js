/**
 * app.js — XTrack frontend logic
 *
 * Architecture:
 *   - All API calls go through a thin `api()` helper (error handling in one place)
 *   - Form has two modes: CREATE and EDIT, tracked by `state.editingId`
 *   - Filters are centralized in `state.filters` and applied on every loadExpenses()
 *   - DOM references cached once after DOMContentLoaded (not re-queried)
 *   - Event delegation on tbody (no inline onclick handlers)
 *   - Bootstrap alerts with auto-dismiss
 */

"use strict";

// ===========================================================================
// Configuration
// ===========================================================================

const API_BASE = "http://127.0.0.1:8000";
const MAX_AMOUNT = 10_000_000; // reasonable upper limit for a personal tracker
const DEBOUNCE_MS = 500;       // delay before title search fires

// Category colors for the Chart.js doughnut chart and legend dots
const categoryColors = {
    Food:          "#f59e0b", // Amber
    Transport:     "#3b82f6", // Blue
    Shopping:      "#ec4899", // Pink
    Bills:         "#ef4444", // Red
    Entertainment: "#8b5cf6", // Purple
    Other:         "#64748b", // Slate
};

// ===========================================================================
// State
// ===========================================================================

const state = {
    /** ID of the expense being edited, or null when in create mode. */
    editingId: null,

    /** ID of the expense pending deletion (set when modal opens). */
    pendingDeleteId: null,

    /** Whether a form submission is in-flight (prevents double-submit). */
    submitting: false,

    /** The month selected for the Monthly Summary dashboard (YYYY-MM string) */
    summaryMonth: "",

    /** Centralized filter state — only non-empty values are sent to the API. */
    filters: {
        title: "",
        category: "",
        from_date: "",
        to_date: "",
    },
};

// ===========================================================================
// DOM references — cached once after DOMContentLoaded
// ===========================================================================

/** @type {Record<string, HTMLElement>} */
let $;

/** Bootstrap Modal instance (lazy-initialised). */
let deleteModalInstance = null;

/** Chart.js Doughnut instance. */
let categoryChartInstance = null;

function cacheDom() {
    const byId = (id) => document.getElementById(id);
    $ = {
        // Expense form
        form:             byId("expense-form"),
        formCard:         document.querySelector(".form-card"),
        formTitle:        byId("form-title"),
        expenseId:        byId("expense-id"),
        title:            byId("title"),
        amount:           byId("amount"),
        category:         byId("category"),
        date:             byId("date"),
        note:             byId("note"),
        noteCount:        byId("note-count"),
        submitBtn:        byId("submit-btn"),
        submitBtnText:    byId("submit-btn-text"),
        resetBtn:         byId("reset-btn"),
        resetBtnText:     byId("reset-btn-text"),
        alertContainer:   byId("alert-container"),
        amountError:      byId("amount-error"),

        // Table
        loadingSpinner:   byId("loading-spinner"),
        emptyState:       byId("empty-state"),
        emptyStateText:   byId("empty-state-text"),
        emptyStateIcon:   byId("empty-state-icon"),
        emptyResetBtn:    byId("empty-reset-filters-btn"),
        expenseTable:     byId("expense-table"),
        expenseTbody:     byId("expense-tbody"),
        expenseCount:     byId("expense-count"),

        // Delete modal
        deleteModal:      byId("delete-modal"),
        deleteTitle:      byId("delete-expense-title"),
        confirmDeleteBtn: byId("confirm-delete-btn"),

        // Filters
        filterCard:       document.querySelector(".filter-card"),
        filterTitle:      byId("filter-title"),
        filterCategory:   byId("filter-category"),
        filterFromDate:   byId("filter-from-date"),
        filterToDate:     byId("filter-to-date"),
        filterDateWarning:byId("filter-date-warning"),
        resetFiltersBtn:  byId("reset-filters-btn"),

        // Monthly Summary Dashboard
        summarySection:        byId("summary-section"),
        summarySubtitle:       byId("summary-subtitle"),
        summaryMonthSelect:    byId("summary-month-select"),
        summaryPrevMonth:      byId("summary-prev-month"),
        summaryNextMonth:      byId("summary-next-month"),
        summaryTotalLabel:     byId("summary-total-label"),
        summaryLoading:        byId("summary-loading"),
        summaryError:          byId("summary-error"),
        summaryErrorText:      byId("summary-error-text"),
        summaryContent:        byId("summary-content"),
        summaryTotal:          byId("summary-total"),
        summaryCountLabel:     byId("summary-count-label"),
        summaryBreakdown:      byId("summary-breakdown"),
        summaryEmptyBreakdown: byId("summary-empty-breakdown"),
        chartContainer:        byId("chart-container"),
        chartEmpty:            byId("chart-empty"),
        categoryChart:         byId("category-chart"),
    };
}

// ===========================================================================
// API helper
// ===========================================================================

/**
 * Thin wrapper around fetch that:
 *  - prepends the base URL
 *  - sets JSON headers for requests with a body
 *  - parses the response as JSON
 *  - throws a descriptive error on non-2xx responses
 */
async function api(path, options = {}) {
    const url = `${API_BASE}${path}`;
    const config = { ...options };

    if (config.body && typeof config.body === "object") {
        config.headers = { "Content-Type": "application/json", ...config.headers };
        config.body = JSON.stringify(config.body);
    }

    let response;
    try {
        response = await fetch(url, config);
    } catch (err) {
        // Re-throw AbortError so callers can detect intentional cancellations
        if (err.name === "AbortError") throw err;
        throw new Error("Network error — is the backend running on port 8000?");
    }

    if (!response.ok) {
        let detail = `Server error (${response.status})`;
        try {
            const body = await response.json();
            if (body.detail) {
                detail = typeof body.detail === "string"
                    ? body.detail
                    : JSON.stringify(body.detail);
            }
        } catch { /* response wasn't JSON */ }
        throw new Error(detail);
    }

    return response.json();
}

// ===========================================================================
// Alerts  (S1 fix: message is always text-escaped)
// ===========================================================================

/**
 * Show a Bootstrap alert that auto-dismisses.
 * Message is safely inserted via textContent — never innerHTML.
 * @param {string} message
 * @param {"success"|"danger"|"warning"|"info"} type
 * @param {number} ms Auto-dismiss delay in milliseconds
 */
function showAlert(message, type = "success", ms = 4000) {
    const icons = {
        success: "bi-check-circle-fill",
        danger:  "bi-exclamation-circle-fill",
        warning: "bi-exclamation-triangle-fill",
        info:    "bi-info-circle-fill",
    };

    const wrapper = document.createElement("div");
    wrapper.className = `alert alert-${type} alert-dismissible fade show d-flex align-items-center`;
    wrapper.setAttribute("role", "alert");

    const icon = document.createElement("i");
    icon.className = `bi ${icons[type] || icons.info} me-2`;
    icon.setAttribute("aria-hidden", "true");

    const text = document.createElement("span");
    text.textContent = message; // S1 fix: safe text insertion

    const closeBtn = document.createElement("button");
    closeBtn.type = "button";
    closeBtn.className = "btn-close";
    closeBtn.setAttribute("data-bs-dismiss", "alert");
    closeBtn.setAttribute("aria-label", "Close");

    wrapper.append(icon, text, closeBtn);
    $.alertContainer.appendChild(wrapper);

    setTimeout(() => {
        if (wrapper.parentNode) wrapper.remove();
    }, ms);
}

// ===========================================================================
// Form helpers
// ===========================================================================

/** Get today's date as YYYY-MM-DD using local timezone (U1 fix). */
function todayISO() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
}

/** Clear all form fields and validation state, return to create mode. */
function resetForm() {
    $.form.reset();
    $.form.classList.remove("was-validated");

    // Clear per-field validation
    clearFieldError($.title, "title-error");
    clearFieldError($.category, "category-error");
    clearFieldError($.date, "date-error");
    clearAmountError();

    $.expenseId.value = "";
    $.date.value = todayISO();
    updateNoteCounter();

    // Exit edit mode
    state.editingId = null;
    $.formCard.classList.remove("edit-mode");
    $.formTitle.innerHTML = '<i class="bi bi-plus-circle me-2" aria-hidden="true"></i>Add Expense';
    $.submitBtnText.textContent = "Save Expense";
    $.resetBtnText.textContent = "Reset";
}

/** Populate form with an existing expense for editing. */
function populateEditForm(expense) {
    // Clear any lingering validation errors first
    resetForm();

    state.editingId = expense.id;
    $.expenseId.value = expense.id;
    $.title.value = expense.title;
    $.amount.value = expense.amount;
    $.category.value = expense.category;
    $.date.value = expense.date;
    $.note.value = expense.note || "";
    updateNoteCounter();

    // Switch UI to edit mode
    $.formCard.classList.add("edit-mode");
    $.formTitle.innerHTML = '<i class="bi bi-pencil me-2" aria-hidden="true"></i>Edit Expense';
    $.submitBtnText.textContent = "Save Changes";
    $.resetBtnText.textContent = "Cancel Edit";

    // Scroll form into view on mobile
    $.formCard.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ===========================================================================
// Validation  (U3 fix: errors clear on input; V1 fix: max amount check)
// ===========================================================================

/**
 * Validate all form fields. Returns true if all pass.
 * Sets Bootstrap `is-invalid` and custom feedback messages.
 */
function validateForm() {
    let valid = true;

    // Reset all errors
    clearFieldError($.title, "title-error");
    clearFieldError($.category, "category-error");
    clearFieldError($.date, "date-error");
    clearAmountError();

    // Title
    const titleVal = $.title.value.trim();
    if (!titleVal) {
        setFieldError($.title, "title-error", "Title is required.");
        valid = false;
    } else if (titleVal.length > 100) {
        setFieldError($.title, "title-error", "Title must be 100 characters or fewer.");
        valid = false;
    }

    // Amount (V1 fix: reject scientific notation and extreme values)
    const amountRaw = $.amount.value;
    const amount = parseFloat(amountRaw);
    if (!amountRaw || isNaN(amount)) {
        setAmountError("Amount is required.");
        valid = false;
    } else if (amount <= 0) {
        setAmountError("Amount must be greater than 0.");
        valid = false;
    } else if (amount > MAX_AMOUNT) {
        setAmountError(`Amount cannot exceed ₹${MAX_AMOUNT.toLocaleString("en-IN")}.`);
        valid = false;
    } else if (/e/i.test(amountRaw)) {
        setAmountError("Please enter a standard number (no scientific notation).");
        valid = false;
    }

    // Category
    if (!$.category.value) {
        setFieldError($.category, "category-error", "Please select a category.");
        valid = false;
    }

    // Date
    if (!$.date.value) {
        setFieldError($.date, "date-error", "Please enter a valid date.");
        valid = false;
    }

    return valid;
}

function setFieldError(el, errorId, message) {
    el.classList.add("is-invalid");
    document.getElementById(errorId).textContent = message;
}

function clearFieldError(el, errorId) {
    el.classList.remove("is-invalid");
    if (errorId) document.getElementById(errorId).textContent = "";
}

/** Amount error uses a custom element outside input-group (C2 fix). */
function setAmountError(message) {
    $.amount.classList.add("is-invalid");
    $.amountError.textContent = message;
    $.amountError.classList.add("show-error");
}

function clearAmountError() {
    $.amount.classList.remove("is-invalid");
    $.amountError.textContent = "";
    $.amountError.classList.remove("show-error");
}

/** V2 fix: Update the note character counter. */
function updateNoteCounter() {
    $.noteCount.textContent = $.note.value.length;
}

/**
 * U3 fix: Attach input/change listeners so validation errors
 * clear as soon as the user starts correcting a field.
 */
function setupLiveValidationClearing() {
    $.title.addEventListener("input", () => clearFieldError($.title, "title-error"));
    $.amount.addEventListener("input", () => clearAmountError());
    $.category.addEventListener("change", () => clearFieldError($.category, "category-error"));
    $.date.addEventListener("input", () => clearFieldError($.date, "date-error"));
    $.note.addEventListener("input", updateNoteCounter);
}

// ===========================================================================
// CRUD operations  (C1 fix: shared saveExpense; B2 fix: async submit)
// ===========================================================================

/**
 * Fetch expenses from the API using current filter state.
 * All CRUD operations call this — filters are always preserved.
 * @param {AbortSignal} [signal] Optional abort signal for cancellation.
 */
async function loadExpenses(signal) {
    $.loadingSpinner.classList.remove("d-none");
    $.emptyState.classList.add("d-none");
    $.expenseTable.classList.add("d-none");

    const queryString = buildQueryParams();
    const path = queryString ? `/expenses/?${queryString}` : "/expenses/";
    const hasActiveFilters = isFiltersActive();

    try {
        const expenses = await api(path, signal ? { signal } : {});
        renderExpenses(expenses);
    } catch (err) {
        // Don't show error for intentionally aborted requests
        if (err.name === "AbortError") return;
        showAlert(`Unable to load expenses. ${err.message}`, "danger");
        $.loadingSpinner.classList.add("d-none");
        $.emptyStateText.textContent = "Unable to load expenses. Please check your connection.";
        // R6 fix: show reset button on error when filters are active
        $.emptyResetBtn.classList.toggle("d-none", !hasActiveFilters);
        $.emptyStateIcon.className = "bi bi-exclamation-circle fs-1 d-block mb-2 text-muted";
        $.emptyState.classList.remove("d-none");
    }
}

/** Render the expense array into the table. */
function renderExpenses(expenses) {
    $.loadingSpinner.classList.add("d-none");
    const hasActiveFilters = isFiltersActive();

    if (!expenses.length) {
        // R8 fix: filter-aware empty icon and message
        $.emptyStateText.textContent = hasActiveFilters
            ? "No expenses match your current filters."
            : "No expenses recorded yet.";
        $.emptyStateIcon.className = hasActiveFilters
            ? "bi bi-search fs-1 d-block mb-2 text-muted"
            : "bi bi-inbox fs-1 d-block mb-2 text-muted";
        $.emptyResetBtn.classList.toggle("d-none", !hasActiveFilters);
        $.emptyState.classList.remove("d-none");
        $.expenseTable.classList.add("d-none");
        $.expenseCount.textContent = "0";
        return;
    }

    $.emptyState.classList.add("d-none");
    $.expenseTable.classList.remove("d-none");
    $.expenseCount.textContent = expenses.length;

    const tbody = $.expenseTbody;
    tbody.innerHTML = "";

    for (const exp of expenses) {
        const tr = document.createElement("tr");
        tr.dataset.id = exp.id;

        // Title
        const tdTitle = document.createElement("td");
        tdTitle.className = "fw-medium";
        tdTitle.textContent = exp.title;

        // Amount
        const tdAmount = document.createElement("td");
        tdAmount.className = "amount-cell";
        tdAmount.textContent = `₹${formatAmount(exp.amount)}`;

        // Category
        const tdCategory = document.createElement("td");
        const badge = document.createElement("span");
        badge.className = `badge badge-category badge-${exp.category}`;
        badge.textContent = exp.category;
        tdCategory.appendChild(badge);

        // Date
        const tdDate = document.createElement("td");
        tdDate.textContent = formatDate(exp.date);

        // Note (hidden on mobile)
        const tdNote = document.createElement("td");
        tdNote.className = "note-cell d-none d-md-table-cell";
        tdNote.textContent = exp.note || "—";
        tdNote.title = exp.note || "";

        // Actions (S2 fix: data attributes, no inline handlers)
        // A1 fix: aria-labels on icon-only buttons
        const tdActions = document.createElement("td");
        tdActions.className = "text-end text-nowrap";
        tdActions.innerHTML = `
            <button class="btn btn-outline-primary btn-action me-1"
                    data-action="edit" data-id="${exp.id}"
                    aria-label="Edit expense: ${escapeAttr(exp.title)}" title="Edit">
                <i class="bi bi-pencil" aria-hidden="true"></i>
            </button>
            <button class="btn btn-outline-danger btn-action"
                    data-action="delete" data-id="${exp.id}" data-title="${escapeAttr(exp.title)}"
                    aria-label="Delete expense: ${escapeAttr(exp.title)}" title="Delete">
                <i class="bi bi-trash" aria-hidden="true"></i>
            </button>
        `;

        tr.append(tdTitle, tdAmount, tdCategory, tdDate, tdNote, tdActions);
        tbody.appendChild(tr);
    }
}

/**
 * C1 fix: Shared save function for both create and update.
 * Handles button state, API call, success/error alerts, and refresh.
 */
async function saveExpense(data) {
    const isEdit = state.editingId !== null;
    const method = isEdit ? "PUT" : "POST";
    const path = isEdit ? `/expenses/${state.editingId}` : "/expenses/";
    const successMsg = isEdit ? "Expense updated successfully!" : "Expense added successfully!";
    const errorMsg = isEdit ? "Unable to update expense." : "Unable to save expense.";

    state.submitting = true;
    $.submitBtn.disabled = true;

    try {
        await api(path, { method, body: data });
        showAlert(successMsg, "success");
        resetForm();
        await Promise.all([loadExpenses(), loadMonthlySummary()]);
    } catch (err) {
        showAlert(`${errorMsg} ${err.message}`, "danger");
    } finally {
        state.submitting = false;
        $.submitBtn.disabled = false;
    }
}

/** DELETE an expense by ID (A3 fix: disable confirm button during deletion). */
async function deleteExpense(id) {
    $.confirmDeleteBtn.disabled = true;
    try {
        await api(`/expenses/${id}`, { method: "DELETE" });
        showAlert("Expense deleted successfully!", "success");
        await Promise.all([loadExpenses(), loadMonthlySummary()]);
    } catch (err) {
        showAlert(`Unable to delete expense. ${err.message}`, "danger");
    } finally {
        $.confirmDeleteBtn.disabled = false;
    }
}

// ===========================================================================
// Event handlers
// ===========================================================================

/** B2 fix: async submit handler, prevents double-submit. */
async function handleSubmit(e) {
    e.preventDefault();

    if (state.submitting) return; // guard against double-submit
    if (!validateForm()) return;

    const data = {
        title:    $.title.value.trim(),
        amount:   parseFloat($.amount.value),
        category: $.category.value,
        date:     $.date.value,
        note:     $.note.value.trim() || null,
    };

    await saveExpense(data);
}

/** Edit button click — fetch full expense and populate form. */
async function handleEdit(id) {
    try {
        const expense = await api(`/expenses/${id}`);
        populateEditForm(expense);
    } catch (err) {
        showAlert(`Expense not found. ${err.message}`, "danger");
    }
}

/** Delete button click — open confirmation modal. */
function handleDelete(id, title) {
    state.pendingDeleteId = id;
    $.deleteTitle.textContent = title;

    if (!deleteModalInstance) {
        deleteModalInstance = new bootstrap.Modal($.deleteModal);
    }
    deleteModalInstance.show();
}

/** Confirm delete inside modal. */
async function handleConfirmDelete() {
    if (state.pendingDeleteId === null) return;

    const id = state.pendingDeleteId;
    state.pendingDeleteId = null;
    deleteModalInstance.hide();

    // If we're editing the expense that's being deleted, exit edit mode
    if (state.editingId === id) {
        resetForm();
    }

    await deleteExpense(id);
}

/**
 * S2 fix: Event delegation on tbody.
 * Catches clicks on edit/delete buttons via data-action attributes.
 */
function handleTableClick(e) {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;

    const action = btn.dataset.action;
    const id = parseInt(btn.dataset.id, 10);

    if (action === "edit") {
        handleEdit(id);
    } else if (action === "delete") {
        handleDelete(id, btn.dataset.title);
    }
}

// ===========================================================================
// Monthly Summary Dashboard Logic
// ===========================================================================

/**
 * Fetch monthly summary data from the API.
 * Updates the Monthly Summary Dashboard UI.
 */
async function loadMonthlySummary() {
    $.summaryLoading.classList.remove("d-none");
    $.summaryError.classList.add("d-none");
    $.summaryContent.classList.add("d-none");

    const monthStr = state.summaryMonth || todayISO().substring(0, 7);
    const [year, month] = monthStr.split("-");

    try {
        const data = await api(`/expenses/summary?year=${year}&month=${parseInt(month, 10)}`);
        renderMonthlySummary(data);
    } catch (err) {
        console.error("Error loading monthly summary:", err);
        $.summaryLoading.classList.add("d-none");
        $.summaryErrorText.textContent = `Unable to load summary: ${err.message}`;
        $.summaryError.classList.remove("d-none");
    }
}

/**
 * Render monthly summary data to the dashboard elements.
 * @param {object} data Summary data returned from the API.
 */
function renderMonthlySummary(data) {
    $.summaryLoading.classList.add("d-none");
    $.summaryContent.classList.remove("d-none");

    // Format Month (input format: "YYYY-MM")
    let formattedMonth = "—";
    if (data.month) {
        const [yearStr, monthStr] = data.month.split("-");
        const year = parseInt(yearStr, 10);
        const monthIndex = parseInt(monthStr, 10) - 1; // 0-11
        // Create date object with day 1 (local time)
        const date = new Date(year, monthIndex, 1);
        formattedMonth = date.toLocaleDateString("en-IN", {
            year: "numeric",
            month: "long",
        });
        if ($.summaryMonthSelect) {
            $.summaryMonthSelect.value = data.month;
        }
    }

    // Update label dynamically with chosen month
    if ($.summaryTotalLabel) {
        $.summaryTotalLabel.textContent = `Total Spent in ${formattedMonth}`;
    }

    // Render Total Spent
    $.summaryTotal.textContent = `₹${formatAmount(data.total)}`;

    // Render Count
    $.summaryCountLabel.textContent = `${data.count} expense${data.count === 1 ? "" : "s"}`;

    // Render category list & chart
    const breakdown = data.breakdown || {};
    const categories = Object.keys(breakdown);

    if (categories.length === 0 || data.total === 0) {
        // Empty state for breakdown
        $.summaryBreakdown.innerHTML = "";
        $.summaryEmptyBreakdown.classList.remove("d-none");

        // Empty state for chart
        $.chartContainer.classList.add("d-none");
        $.chartEmpty.classList.remove("d-none");

        if (categoryChartInstance) {
            categoryChartInstance.destroy();
            categoryChartInstance = null;
        }
    } else {
        $.summaryEmptyBreakdown.classList.add("d-none");
        $.chartEmpty.classList.add("d-none");
        $.chartContainer.classList.remove("d-none");

        // Clear and populate category list
        $.summaryBreakdown.innerHTML = "";
        
        // Sort categories by amount descending
        const sortedCats = categories.slice().sort((a, b) => breakdown[b] - breakdown[a]);

        for (const cat of sortedCats) {
            const amount = breakdown[cat];
            const pct = data.total > 0 ? ((amount / data.total) * 100).toFixed(1) : "0.0";

            const li = document.createElement("li");
            li.className = "list-group-item d-flex justify-content-between align-items-center border-0 px-0 py-2 breakdown-item";

            // Left side: dot + label
            const leftDiv = document.createElement("div");
            leftDiv.className = "d-flex align-items-center";

            const dot = document.createElement("span");
            dot.className = "breakdown-dot me-2";
            dot.style.backgroundColor = categoryColors[cat] || "#64748b";

            const labelSpan = document.createElement("span");
            labelSpan.className = "fw-medium";
            labelSpan.textContent = cat;

            leftDiv.append(dot, labelSpan);

            // Right side: amount + percentage
            const rightDiv = document.createElement("div");
            rightDiv.className = "text-end";

            const amountSpan = document.createElement("span");
            amountSpan.className = "fw-semibold d-block";
            amountSpan.textContent = `₹${formatAmount(amount)}`;

            const pctSpan = document.createElement("small");
            pctSpan.className = "text-muted";
            pctSpan.textContent = `${pct}%`;

            rightDiv.append(amountSpan, pctSpan);

            li.append(leftDiv, rightDiv);
            $.summaryBreakdown.appendChild(li);
        }

        // Render Doughnut Chart using Chart.js
        if (categoryChartInstance) {
            categoryChartInstance.destroy();
        }

        const labels = sortedCats;
        const values = sortedCats.map(cat => breakdown[cat]);
        const colors = sortedCats.map(cat => categoryColors[cat] || "#64748b");

        categoryChartInstance = new Chart($.categoryChart, {
            type: "doughnut",
            data: {
                labels: labels,
                datasets: [{
                    data: values,
                    backgroundColor: colors,
                    borderWidth: 1,
                    hoverOffset: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        callbacks: {
                            label: function(context) {
                                const val = context.raw || 0;
                                const total = context.dataset.data.reduce((a, b) => a + b, 0);
                                const percentage = total > 0 ? ((val / total) * 100).toFixed(1) : 0;
                                return ` ₹${formatAmount(val)} (${percentage}%)`;
                            }
                        }
                    }
                },
                cutout: "70%"
            }
        });
    }
}

/**
 * Increment or decrement the selected month by a given offset.
 * Handles boundary years correctly.
 */
function shiftSummaryMonth(offset) {
    const currentVal = state.summaryMonth || todayISO().substring(0, 7);
    const [yearStr, monthStr] = currentVal.split("-");
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10) - 1; // 0-11

    const d = new Date(year, month + offset, 1);
    const newYear = d.getFullYear();
    const newMonth = String(d.getMonth() + 1).padStart(2, "0");

    state.summaryMonth = `${newYear}-${newMonth}`;
    if ($.summaryMonthSelect) {
        $.summaryMonthSelect.value = state.summaryMonth;
    }
    loadMonthlySummary();
}

// ===========================================================================
// Utility functions
// ===========================================================================

/** Escape a string for safe use in an HTML attribute value. */
function escapeAttr(str) {
    return str
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

/** Format a number as a currency amount (e.g. 1234.5 → "1,234.50"). */
function formatAmount(num) {
    return Number(num).toLocaleString("en-IN", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    });
}

/** Format a YYYY-MM-DD date string into a readable format. */
function formatDate(dateStr) {
    const d = new Date(dateStr + "T00:00:00"); // avoid timezone shift
    return d.toLocaleDateString("en-IN", {
        year: "numeric",
        month: "short",
        day: "numeric",
    });
}

// ===========================================================================
// Filter logic
// ===========================================================================

/**
 * R1/R2 fix: AbortController for in-flight filter requests.
 * When a new filter request starts, the previous one is aborted.
 */
let filterAbortController = null;

/**
 * R3/R4 fix: Shared debounce timer for the entire filter pipeline.
 * Both debounced (title) and immediate (category/date) triggers
 * go through this single timer. Immediate triggers set delay=0.
 */
let filterTimer = null;

/** Returns true if any filter has a non-empty value. */
function isFiltersActive() {
    return Object.values(state.filters).some(v => v !== "");
}

/** Build URL query string from current filter state (skip empty values). */
function buildQueryParams() {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(state.filters)) {
        if (value) params.set(key, value);
    }
    return params.toString();
}

/** Validate the from/to date range. Returns true if valid. */
function validateDateRange() {
    const { from_date, to_date } = state.filters;
    if (from_date && to_date && from_date > to_date) {
        $.filterDateWarning.classList.remove("d-none");
        return false;
    }
    $.filterDateWarning.classList.add("d-none");
    return true;
}

/** Sync current filter UI values into state.filters. */
function syncFiltersFromUI() {
    state.filters.title     = $.filterTitle.value.trim();
    state.filters.category  = $.filterCategory.value;
    state.filters.from_date = $.filterFromDate.value;
    state.filters.to_date   = $.filterToDate.value;
}

/**
 * R3 fix: Unified filter pipeline.
 * Schedules a filter fetch after `delay` ms. If called again before
 * the timer fires, the previous timer is cancelled (natural debounce).
 * Immediate triggers pass delay=0.
 */
function scheduleFilterFetch(delay) {
    // Sync UI → state eagerly (so the latest values are always captured)
    syncFiltersFromUI();

    // Show/hide the reset button in the filter card header
    $.resetFiltersBtn.classList.toggle("d-none", !isFiltersActive());

    // Validate date range — don't fetch if invalid
    if (!validateDateRange()) return;

    // R3/R4 fix: cancel any pending debounce timer
    clearTimeout(filterTimer);

    filterTimer = setTimeout(() => executeFilterFetch(), delay);
}

/**
 * Execute the actual filter fetch.
 * R1 fix: always fetches (never drops a request).
 * R2 fix: aborts previous in-flight request to prevent stale overwrites.
 */
async function executeFilterFetch() {
    // Abort any previous in-flight filter request
    if (filterAbortController) {
        filterAbortController.abort();
    }
    filterAbortController = new AbortController();

    $.filterCard.classList.add("filtering");

    try {
        await loadExpenses(filterAbortController.signal);
    } finally {
        $.filterCard.classList.remove("filtering");
        filterAbortController = null;
    }
}

/** Reset all filters to defaults and reload. */
async function resetFilters() {
    // R4 fix: cancel any pending debounce timer
    clearTimeout(filterTimer);

    // Abort any in-flight filter request
    if (filterAbortController) {
        filterAbortController.abort();
        filterAbortController = null;
    }

    state.filters.title     = "";
    state.filters.category  = "";
    state.filters.from_date = "";
    state.filters.to_date   = "";

    // Reset UI controls
    $.filterTitle.value    = "";
    $.filterCategory.value = "";
    $.filterFromDate.value = "";
    $.filterToDate.value   = "";
    $.filterDateWarning.classList.add("d-none");
    $.resetFiltersBtn.classList.add("d-none");

    await loadExpenses();
}

/** Set up filter change listeners (called once on init). */
function setupFilterListeners() {
    // R3 fix: title is debounced, category/dates are immediate (delay=0).
    // All go through the same scheduleFilterFetch pipeline.
    $.filterTitle.addEventListener("input",  () => scheduleFilterFetch(DEBOUNCE_MS));
    $.filterCategory.addEventListener("change", () => scheduleFilterFetch(0));
    // R5 fix: use "input" for date fields to catch clears via the X button
    $.filterFromDate.addEventListener("input", () => scheduleFilterFetch(0));
    $.filterToDate.addEventListener("input",   () => scheduleFilterFetch(0));

    // Reset buttons (header + empty state)
    $.resetFiltersBtn.addEventListener("click", resetFilters);
    $.emptyResetBtn.addEventListener("click", resetFilters);
}

// ===========================================================================
// Initialisation
// ===========================================================================

document.addEventListener("DOMContentLoaded", () => {
    cacheDom();

    // Set default date to today (local timezone)
    $.date.value = todayISO();
    updateNoteCounter();

    // Wire up event listeners — CRUD
    $.form.addEventListener("submit", handleSubmit);
    $.resetBtn.addEventListener("click", resetForm);
    $.confirmDeleteBtn.addEventListener("click", handleConfirmDelete);
    $.expenseTbody.addEventListener("click", handleTableClick);

    // Wire up event listeners — Filters
    setupFilterListeners();

    // Live validation clearing
    setupLiveValidationClearing();

    // Set default month to current month
    state.summaryMonth = todayISO().substring(0, 7);
    if ($.summaryMonthSelect) {
        $.summaryMonthSelect.value = state.summaryMonth;
    }

    // Wire up Monthly Summary navigation listeners
    if ($.summaryMonthSelect) {
        $.summaryMonthSelect.addEventListener("change", () => {
            state.summaryMonth = $.summaryMonthSelect.value;
            loadMonthlySummary();
        });
    }
    if ($.summaryPrevMonth) {
        $.summaryPrevMonth.addEventListener("click", () => shiftSummaryMonth(-1));
    }
    if ($.summaryNextMonth) {
        $.summaryNextMonth.addEventListener("click", () => shiftSummaryMonth(1));
    }

    // Load initial data concurrently
    Promise.all([loadExpenses(), loadMonthlySummary()]);
});
