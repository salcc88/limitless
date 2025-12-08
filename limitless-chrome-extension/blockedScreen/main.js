const params = new URLSearchParams(window.location.search);
const site = params.get("site") || "this site";
const peekMode = params.get("pm") === "true";

const peekTextElement = document.getElementById("peek-message");
if (peekMode) {
  peekTextElement.style.display = "block";
}

document.getElementById("blocked-text").textContent = `You've hit your limit for ${site} today.`;

document.getElementById("peek-link").addEventListener("click", async (e) => {
  e.preventDefault();
  const { peekDuration } = await chrome.storage.local.get("peekDuration");
  chrome.runtime.sendMessage({
    type: "startPeek",
    duration: peekDuration
  });
});
