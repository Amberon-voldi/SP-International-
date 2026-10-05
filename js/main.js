(function () {
  "use strict";

  var toggle = document.querySelector(".nav-toggle");
  var nav = document.getElementById("site-nav");
  var yearEl = document.getElementById("year");
  var form = document.getElementById("quote-form");

  if (yearEl) yearEl.textContent = String(new Date().getFullYear());

  var wa = "https://wa.me/919286492989";
  document.querySelectorAll("[data-wa]").forEach(function (el) {
    el.setAttribute("href", wa);
    el.setAttribute("rel", "noopener");
  });

  var productEl = document.getElementById("product");
  if (productEl) {
    var q = new URLSearchParams(window.location.search).get("product");
    if (q) {
      var opts = productEl.options;
      for (var i = 0; i < opts.length; i++) {
        if (opts[i].value === q || opts[i].text === q) {
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
      if (e.key === "Escape") setNav(false);
    });
  }

  function val(id) {
    var el = document.getElementById(id);
    return el ? String(el.value || "").trim() : "";
  }

  function setStatus(type, msg) {
    var box = document.getElementById("form-status");
    if (!box) return;
    box.className = "form-status " + type;
    box.textContent = msg;
  }

  function gather() {
    return {
      name: val("name"),
      company: val("company"),
      country: val("country"),
      email: val("email"),
      whatsapp: val("whatsapp"),
      product: val("product"),
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
    var lines = [
      "Quote request — SP International Pvt Ltd",
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
      "Message:",
      data.message
    ];
    return lines.join("\n");
  }

  function openMailto(data) {
    var subject = "Quote request — " + (data.product || "enquiry") + " — " + data.name;
    var href =
      "mailto:info@spinternationalpvtltd.com" +
      "?subject=" + encodeURIComponent(subject) +
      "&body=" + encodeURIComponent(composeBody(data));
    window.location.href = href;
  }

  function openWhatsApp(data) {
    var href =
      "https://wa.me/919286492989?text=" + encodeURIComponent(composeBody(data));
    window.open(href, "_blank", "noopener");
  }

  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var data = gather();
      var err = validate(data);
      if (err) {
        setStatus("error", err);
        return;
      }
      setStatus("ok", "Opening your email app with a drafted message to info@spinternationalpvtltd.com.");
      openMailto(data);
    });

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
    }
  }
})();
