const params = new URLSearchParams(window.location.search);
const site = params.get("site") || "this site";
document.getElementById("blocked-text").textContent = `You've hit your limit for ${site} today.`;
