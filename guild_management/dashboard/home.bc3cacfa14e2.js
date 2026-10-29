/* global GOE_ANNIVERSARIES, GOE_MEMBER_ROSTER */
(function () {
  "use strict";
  const api = window.GOE_ANNIVERSARIES;
  const roster = api.validateRoster(window.GOE_MEMBER_ROSTER);
  const $ = id => document.getElementById(id);
  const members = roster.members.filter(member => member.status === "current");
  let today;

  function render() {
    today = api.todayInGuild();
    const upcoming = api.upcoming(members, today);
    $("home-member-count").textContent = `${members.length} members · one guild`;
    const first = upcoming[0];
    if (!first) {
      $("home-next-label").textContent = "Our guild family";
      $("home-next-month").textContent = "GOE";
      $("home-next-day").textContent = "✦";
      $("home-next-name").textContent = "Every year, together";
      $("home-next-detail").textContent = "Meet the people who make Elysium feel like home.";
      $("home-next-tagline").textContent = "";
      $("home-next-tagline").hidden = true;
      $("home-next-outlook").textContent = "Join dates and guild milestones";
      return;
    }
    const { member, next } = first;
    const date = new Date(`${next.date}T12:00:00Z`);
    const options = { timeZone: "UTC" };
    $("home-next-label").textContent = next.days === 0 ? "Celebrating today" : next.days === 1 ? "Celebrating tomorrow" : `Next celebration · in ${next.days} days`;
    $("home-next-month").textContent = new Intl.DateTimeFormat("en-US", { ...options, month: "short" }).format(date);
    $("home-next-day").textContent = new Intl.DateTimeFormat("en-US", { ...options, day: "2-digit" }).format(date);
    $("home-next-name").textContent = member.name;
    const dateLabel = new Intl.DateTimeFormat("en-US", { ...options, month: "short", day: "numeric", year: "numeric" }).format(date);
    $("home-next-detail").textContent = `${next.years} ${next.years === 1 ? "year" : "years"} together · ${dateLabel}`;
    $("home-next-tagline").textContent = member.tagline || "";
    $("home-next-tagline").hidden = !member.tagline;
    const soon = upcoming.filter(item => item.next.days <= 30).length;
    $("home-next-outlook").textContent = soon ? `${soon} ${soon === 1 ? "anniversary" : "anniversaries"} in the next 30 days` : "Another year worth celebrating";
  }
  document.addEventListener("visibilitychange", () => { if (!document.hidden) render(); });
  setInterval(() => { if (api.todayInGuild() !== today) render(); }, 60000);
  render();
})();
