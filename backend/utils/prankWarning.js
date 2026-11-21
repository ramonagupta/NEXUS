// utils/prankWarning.js
// The warning every person sees when signing in. NEXUS sends real ambulances, fire engines
// and police, so a prank call takes them away from someone who needs them.
// The frontend shows its own copy: a tick-box when signing up and a notice after every log in.
// This text comes back from GET /api/auth/warning and with every token. The server records
// when it was accepted (User.warningAcceptedAt) and every report is stored with the phone number.

const PRANK_WARNING = {
  title: "This is a real emergency service",
  message:
    "NEXUS sends real ambulances, fire engines and police. False reports can lead to legal action. " +
    "Your phone number is attached to every report you make, and a number used for false reports " +
    "is blocked. Only report a real emergency.",
  acceptLabel: "I understand. I will only report real emergencies.",
};

module.exports = { PRANK_WARNING };
