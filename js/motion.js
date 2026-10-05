(function () {
  "use strict";

  var root = document.documentElement;
  var reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  var coarsePointer = window.matchMedia("(pointer: coarse)");
  var controls = document.querySelectorAll("[data-motion-toggle]");
  var revealTargets = document.querySelectorAll("[data-reveal]");
  var parallaxTargets = document.querySelectorAll("[data-parallax]");
  var header = document.querySelector(".site-header");
  var progress = document.querySelector(".scroll-progress");
  var manuallyPaused = false;
  var observer = null;
  var frameRequested = false;

  function isActive() {
    return !reducedMotion.matches && !manuallyPaused;
  }

  function showEverything() {
    if (observer) observer.disconnect();
    revealTargets.forEach(function (target) {
      target.classList.remove("reveal-ready");
      target.classList.add("is-revealed");
    });
  }

  function revealSections() {
    if (observer) observer.disconnect();
    if (!isActive() || !("IntersectionObserver" in window)) {
      showEverything();
      return;
    }
    try {
      observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-revealed");
          observer.unobserve(entry.target);
        });
      }, { threshold: 0.14, rootMargin: "0px 0px -9% 0px" });
      revealTargets.forEach(function (target) {
        // Forms and their controls must never depend on an animation to be usable.
        if (target.matches("form") || target.querySelector("form")) return;
        if (target.classList.contains("is-revealed")) return;
        var siblings = target.parentElement.querySelectorAll(":scope > [data-reveal]");
        var index = Array.prototype.indexOf.call(siblings, target);
        target.style.setProperty("--reveal-delay", Math.min(Math.max(index, 0) * 120, 480) + "ms");
        target.classList.add("reveal-ready");
        if (target.getBoundingClientRect().top < window.innerHeight - 24) {
          target.classList.add("is-revealed");
        } else {
          observer.observe(target);
        }
      });
    } catch (error) {
      // Progressive enhancement must fail open if a browser cannot observe sections.
      showEverything();
    }
  }

  function updateScroll() {
    frameRequested = false;
    var scroll = Math.max(window.scrollY || 0, 0);
    if (header) header.classList.toggle("is-scrolled", scroll > 16);
    if (progress) {
      var available = root.scrollHeight - window.innerHeight;
      var ratio = available > 0 ? Math.min(scroll / available, 1) : 0;
      progress.style.transform = "scaleX(" + ratio + ")";
    }
    parallaxTargets.forEach(function (target) {
      if (!isActive() || coarsePointer.matches || window.innerWidth < 960) {
        target.style.removeProperty("transform");
        return;
      }
      var rect = target.getBoundingClientRect();
      if (rect.bottom < 0 || rect.top > window.innerHeight) return;
      var strength = Number(target.getAttribute("data-parallax")) || 0;
      var offset = Math.min(scroll * strength, 16);
      target.style.transform = "translate3d(0, " + offset.toFixed(2) + "px, 0)";
    });
  }

  function requestScrollUpdate() {
    if (frameRequested) return;
    frameRequested = true;
    window.requestAnimationFrame(updateScroll);
  }

  function updateMotion() {
    var active = isActive();
    root.classList.toggle("motion-enabled", active);
    root.classList.toggle("motion-paused", !active);
    controls.forEach(function (control) {
      control.hidden = false;
      control.disabled = reducedMotion.matches;
      control.setAttribute("aria-pressed", active ? "false" : "true");
      control.textContent = reducedMotion.matches ? "Reduced motion" : (active ? "Pause motion" : "Resume motion");
    });
    revealSections();
    requestScrollUpdate();
  }

  controls.forEach(function (control) {
    control.addEventListener("click", function () {
      manuallyPaused = !manuallyPaused;
      updateMotion();
    });
  });
  document.addEventListener("focusin", function (event) {
    var target = event.target.closest("[data-reveal]");
    if (!target) return;
    target.classList.add("is-revealed");
    if (observer) observer.unobserve(target);
  });
  document.addEventListener("visibilitychange", function () {
    root.classList.toggle("motion-suspended", document.hidden);
    if (!document.hidden) requestScrollUpdate();
  });
  window.addEventListener("scroll", requestScrollUpdate, { passive: true });
  window.addEventListener("resize", requestScrollUpdate, { passive: true });
  if (reducedMotion.addEventListener) reducedMotion.addEventListener("change", updateMotion);
  else reducedMotion.addListener(updateMotion);

  updateMotion();
})();
