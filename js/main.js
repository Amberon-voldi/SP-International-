(function () {
  "use strict";

  var toggle = document.querySelector(".nav-toggle");
  var nav = document.getElementById("site-nav");
  var yearEl = document.getElementById("year");
  var form = document.getElementById("quote-form");
  var wa = "https://wa.me/919286492989";

  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  document.querySelectorAll("[data-wa]").forEach(function (el) {
    el.setAttribute("href", wa);
    el.setAttribute("rel", "noopener");
  });

  var productEl = document.getElementById("product");
  if (productEl) {
    var requestedProduct = new URLSearchParams(window.location.search).get("product");
    if (requestedProduct) {
      for (var i = 0; i < productEl.options.length; i++) {
        var option = productEl.options[i];
        if (option.value === requestedProduct || option.text === requestedProduct) {
          productEl.selectedIndex = i;
          break;
        }
      }
    }
  }

  function setNav(open) {
    if (!toggle || !nav) return;
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    nav.classList.toggle("is-open", open);
    document.body.classList.toggle("nav-open", open);
  }

  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      setNav(toggle.getAttribute("aria-expanded") !== "true");
    });
    nav.querySelectorAll("a").forEach(function (link) {
      link.addEventListener("click", function () { setNav(false); });
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && toggle.getAttribute("aria-expanded") === "true") {
        setNav(false);
        toggle.focus();
      }
    });
  }

  if (!form) return;

  var preview = document.getElementById("draft-preview");
  var draftField = document.getElementById("enquiry-draft");
  var draftTitle = document.getElementById("draft-title");
  var draftHint = document.getElementById("draft-hint");
  var submitButton = document.getElementById("submit-quote");
  var config = window.SP_QUOTE_CONFIG || {};
  var endpoint = "";
  var configProblem = "";
  var timeoutMs = Number(config.timeoutMs);
  if (!Number.isFinite(timeoutMs) || timeoutMs < 100 || timeoutMs > 60000) timeoutMs = 12000;
  var busy = false;
  var lockedFields = [];
  var receivedKey = "";
  var draftInstruction = "A draft does not send a request. Review it and press Send in WhatsApp or your email app. If an app does not open, copy the message and use the direct contact details.";

  if (config.endpoint) {
    try {
      var url = new URL(String(config.endpoint));
      if (url.protocol !== "https:" || url.username || url.password || url.hash) throw new Error("Unsafe endpoint");
      if (!window.fetch || !window.AbortController) throw new Error("Submission unavailable");
      endpoint = url.href;
    } catch (error) {
      configProblem = "Online submission is unavailable with the current configuration. ";
    }
  }

  var submitLabel = endpoint ? "Send quote request" : "Open email draft — then Send";
  submitButton.textContent = submitLabel;
  if (endpoint) {
    document.getElementById("quote-form-note").textContent = "Send a formal request with product, delivery country and email. The connected quotation service must acknowledge it before we show received. Or start on WhatsApp with only your product.";
    document.getElementById("quote-privacy-note").textContent = "Choosing Send quote request shares your buying and contact details with the connected quotation service for handling your enquiry. Draft and WhatsApp actions do not submit to that service. No website payment.";
  } else if (configProblem) {
    document.getElementById("quote-form-note").textContent = configProblem + "Use an email draft instead: review it and press Send in your email app. WhatsApp needs only your product.";
    document.getElementById("quote-privacy-note").textContent = "Online submission is unavailable. The website does not save your enquiry; email or WhatsApp handles the message you choose to send.";
  }

  function val(id) {
    var el = document.getElementById(id);
    return el ? String(el.value || "").trim() : "";
  }

  function setStatus(type, message) {
    var box = document.getElementById("form-status");
    box.className = "form-status" + (type ? " " + type : "");
    box.textContent = message;
  }

  function clearInvalid(id) {
    var fields = id ? [document.getElementById(id)] : form.querySelectorAll('[aria-invalid="true"]');
    Array.prototype.forEach.call(fields, function (field) {
      if (!field) return;
      field.removeAttribute("aria-invalid");
      var description = (field.getAttribute("aria-describedby") || "").split(/\s+/).filter(function (token) {
        return token && token !== "form-status";
      }).join(" ");
      if (description) field.setAttribute("aria-describedby", description);
      else field.removeAttribute("aria-describedby");
    });
  }

  function gather() {
    var checked = form.querySelector('input[name="quantity_unit"]:checked');
    return {
      name: val("name"),
      company: val("company"),
      country: val("country"),
      email: val("email"),
      whatsapp: val("whatsapp"),
      product: val("product"),
      productLabel: productEl.options[productEl.selectedIndex].text,
      quantity: val("quantity"),
      unit: selectedUnit(),
      message: val("message")
    };
  }

  function selectedUnit() {
    var checked = document.querySelector('#quote-form input[name="quantity_unit"]:checked');
    return checked ? String(checked.value || "").trim() : "";
  }

  function markUnitInvalid(invalid) {
    var field = document.getElementById("quantity-unit");
    if (!field) return;
    if (invalid) field.setAttribute("aria-invalid", "true");
    else field.removeAttribute("aria-invalid");
  }

  function validate(data) {
    if (!data.name) return "Please enter your name.";
    if (!data.email && !data.whatsapp) return "Please give an email or a WhatsApp number so we can reply.";
    if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) return "Please check the email address.";
    if (data.quantity && data.unit !== "kg" && data.unit !== "tonnes") {
      markUnitInvalid(true);
      var firstUnit = document.getElementById("quantity-unit-kg");
      if (firstUnit) firstUnit.focus();
      return "Please choose kg or tonnes for the quantity.";
    }
    markUnitInvalid(false);
    if (!data.message) return "Please add a short message.";
    return "";
  }

  function quantityWithUnit(data) {
    if (!data.quantity) return "—";
    return data.unit ? data.quantity + " " + data.unit : data.quantity;
  }

  function composeBody(data) {
    var quantity = data.quantity ? data.quantity + (data.unit ? " " + data.unit : "") : "To be discussed";
    return [
      "Quotation enquiry — SP International Pvt Ltd",
      "",
      "Name: " + data.name,
      "Company: " + (data.company || "—"),
      "Country: " + (data.country || "—"),
      "Email: " + (data.email || "—"),
      "WhatsApp: " + (data.whatsapp || "—"),
      "Product interest: " + (data.product || "—"),
      "Quantity (optional): " + quantityWithUnit(data),
      "Unit: " + (data.unit || "—"),
      "",
      "Name: " + (data.name || "Not provided"),
      "Company: " + (data.company || "Not provided"),
      "Email: " + (data.email || "Not provided"),
      "WhatsApp: " + (data.whatsapp || "Not provided"),
      "",
      "Specifications / notes:",
      data.message || "Please contact me to discuss my requirements and prepare a quotation."
    ].join("\n");
  }

  function prepareDraft(formal) {
    clearInvalid();
    var data = gather();
    var error = validate(data, formal);
    if (error) {
      preview.hidden = true;
      showError(error);
      return null;
    }
    var body = composeBody(data);
    var subject = "Quotation enquiry — " + data.productLabel + (data.name ? " — " + data.name : "");
    var draft = {
      data: data,
      body: body,
      email: "mailto:info@spinternationalpvtltd.com?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body),
      whatsapp: wa + "?text=" + encodeURIComponent(body)
    };
    draftField.value = body;
    document.getElementById("draft-email-link").href = draft.email;
    document.getElementById("draft-whatsapp-link").href = draft.whatsapp;
    draftTitle.textContent = "Your enquiry draft";
    draftHint.textContent = draftInstruction;
    preview.hidden = false;
    return draft;
  }

  function syncActions() {
    form.querySelectorAll("[data-enquiry-action]").forEach(function (button) {
      button.disabled = busy || (button === submitButton && receivedKey === JSON.stringify(gather()));
    });
    submitButton.textContent = busy ? "Sending request…" : receivedKey ? "Request received by service" : submitLabel;
  }

    form.querySelectorAll('input[name="quantity_unit"]').forEach(function (radio) {
      radio.addEventListener("change", function () { markUnitInvalid(false); });
    });

    var quantityInput = document.getElementById("quantity");
    function syncUnitRequired() {
      var needed = !!(quantityInput && quantityInput.value.trim());
      form.querySelectorAll('input[name="quantity_unit"]').forEach(function (radio) {
        if (needed) radio.setAttribute("required", "");
        else radio.removeAttribute("required");
      });
      var field = document.getElementById("quantity-unit");
      if (field) field.setAttribute("aria-required", needed ? "true" : "false");
    }
    if (quantityInput) {
      quantityInput.addEventListener("input", syncUnitRequired);
      syncUnitRequired();
    }

    var waBtn = document.getElementById("send-whatsapp");
    if (waBtn) {
      waBtn.addEventListener("click", function () {
        var data = gather();
        var err = validate(data);
        if (err) {
          setStatus("error", err);
          return;
        }
        setStatus("ok", "Opening WhatsApp with the same message.");
        openWhatsApp(data);
      });
      if (!response.ok) throw new Error("Service did not acknowledge");
      var acknowledgement = await response.json();
      if (!acknowledgement || acknowledgement.received !== true) throw new Error("Service did not acknowledge");
      receivedKey = key;
      form.dataset.submissionState = "received";
      draftTitle.textContent = "Request received by the quotation service";
      draftHint.textContent = "The service acknowledged your request. This is not confirmation of delivery to the company inbox. Keep this draft for your records; you do not need to send it again.";
      setStatus("ok", "Request received by the quotation service. This confirms service acknowledgement, not delivery to the company inbox. The desk will review your buying details.");
    } catch (error) {
      form.dataset.submissionState = "error";
      draftTitle.textContent = "Keep your enquiry — receipt not confirmed";
      draftHint.textContent = "Receipt could not be confirmed. Your request may or may not have reached the service. Use an email or WhatsApp draft below, or copy your enquiry for direct contact. Review and press Send in the app.";
      setStatus("error", (timedOut ? "The quotation service took too long to acknowledge your request. " : "We could not confirm receipt from the quotation service. ") + "Your details are still here. Use the email or WhatsApp draft below, copy your enquiry, or retry. A failed acknowledgement does not prove the service received nothing.");
    } finally {
      clearTimeout(timer);
      setBusy(false);
    }
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (busy || receivedKey === JSON.stringify(gather())) return;
    var draft = prepareDraft(true);
    if (!draft) return;
    if (endpoint) {
      submitRequest(draft);
      return;
    }
    form.dataset.submissionState = "draft";
    setStatus("ok", configProblem + "Opening your email draft. Review it and press Send in your email app. Nothing has been submitted by this website.");
    window.location.href = draft.email;
  });

  document.getElementById("send-whatsapp").addEventListener("click", function () {
    if (busy) return;
    var draft = prepareDraft(false);
    if (!draft) return;
    setStatus("ok", "Opening your WhatsApp draft. Review it and press Send in WhatsApp. This action has not submitted anything to the quotation service.");
    window.location.href = draft.whatsapp;
  });

  document.getElementById("preview-enquiry").addEventListener("click", function () {
    if (busy || !prepareDraft(false)) return;
    setStatus("ok", "Your enquiry draft is ready. Review it, choose email or WhatsApp below, or copy the message. A draft still needs you to press Send; it does not submit the formal quote route.");
    preview.scrollIntoView({ block: "nearest" });
  });

  document.getElementById("copy-enquiry").addEventListener("click", function () {
    if (preview.hidden || !draftField.value) return;
    function selectForCopy() {
      draftField.focus();
      draftField.select();
      setStatus("ok", "Select Copy, or press Ctrl+C / Command+C, to copy the highlighted enquiry message.");
    }
    if (!navigator.clipboard || !navigator.clipboard.writeText) {
      selectForCopy();
      return;
    }
    navigator.clipboard.writeText(draftField.value).then(function () {
      setStatus("ok", "Enquiry copied. Paste it into an email or WhatsApp message to the desk and press Send if you have not already submitted your request.");
    }).catch(selectForCopy);
  });

  function invalidateDraft(e) {
    if (e.target === draftField || busy) return;
    clearInvalid(e.target.id);
    receivedKey = "";
    form.dataset.submissionState = "idle";
    preview.hidden = true;
    draftField.value = "";
    setStatus("", "");
    syncUnitRequired();
    syncActions();
  }
  form.addEventListener("input", invalidateDraft);
  form.addEventListener("change", invalidateDraft);
  form.addEventListener("reset", function () {
    if (busy) return;
    setTimeout(function () {
      clearInvalid();
      receivedKey = "";
      form.dataset.submissionState = "idle";
      preview.hidden = true;
      draftField.value = "";
      setStatus("", "");
      syncUnitRequired();
      syncActions();
    }, 0);
  });

  syncUnitRequired();
  syncActions();
})();
