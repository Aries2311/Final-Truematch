// plan-select.js — pre-auth plan selection step
(() => {
  // Safety check para lang talaga sa plan-select page tumakbo
  if (!/plan-select\.html(?:$|[?#])/.test(location.pathname)) return;

  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function buildAuthUrl(planCode) {
    const params = new URLSearchParams(location.search || "");

    // Make sure we always end up in sign-up + onboarding from here
    if (!params.get("mode")) params.set("mode", "signup");
    if (!params.get("onboarding")) params.set("onboarding", "1");

    // For paid tiers, carry prePlan; for free we deliberately skip it
    if (planCode && planCode !== "free") {
      params.set("prePlan", planCode);
    } else {
      params.delete("prePlan");
    }

    const qs = params.toString();
    return `auth.html${qs ? `?${qs}` : ""}#signup`;
  }

  function wirePlanButtons() {
    const links = $$("a[data-plan]");
    if (!links.length) return;

    links.forEach((link) => {
      const planCode = link.dataset.plan || "";

      link.addEventListener("click", (ev) => {
        ev.preventDefault();

        try {
          // Optional: disable button para di ma-double click
          link.disabled = true;
        } catch (_) {}

        const nextUrl = buildAuthUrl(planCode);
        window.location.href = nextUrl;
      });
    });
  }

  document.addEventListener("DOMContentLoaded", wirePlanButtons);
})();
