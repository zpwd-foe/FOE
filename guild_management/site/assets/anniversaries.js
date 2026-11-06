/* global GOE_ANNIVERSARIES, GOE_MEMBER_ROSTER */
(function () {
  "use strict";
  const api = window.GOE_ANNIVERSARIES;
  const $ = id => document.getElementById(id);
  const roster = api.validateRoster(window.GOE_MEMBER_ROSTER);
  let today = api.todayInGuild();
  const escape = value => String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
  const dateLabel = value => new Intl.DateTimeFormat("en-US", { timeZone: "UTC", month: "short", day: "numeric", year: "numeric" }).format(new Date(`${value}T12:00:00Z`));
  const dateHtml = value => `<time datetime="${value}">${dateLabel(value)}</time>`;
  const recordedDateHtml = value => value ? dateHtml(value) : '<span class="unknown-date">Unknown</span>';
  const when = days => days === 0 ? "Today" : days === 1 ? "Tomorrow" : `In ${days} days`;
  function render() {
    today = api.todayInGuild();
    const current = roster.members.filter(member => member.status === "current");
    const upcoming = api.upcoming(roster.members, today);
    $("member-count").textContent = current.length;
    $("known-dates").textContent = `${current.filter(member => member.joinedOn).length} of ${current.length} join dates recorded`;
    $("today-count").textContent = upcoming.filter(item => item.next.days === 0).length;
    $("upcoming-count").textContent = upcoming.filter(item => item.next.days > 0 && item.next.days <= 30).length;
    $("guild-date").textContent = `${dateLabel(today)} · Eastern time`;
    $("anniversary-cards").innerHTML = upcoming.slice(0, 6).map(({ member, next }) => `
      <article class="anniversary-card${next.days === 0 ? " is-today" : ""}">
        <div class="anniversary-medallion" aria-hidden="true"><span class="medallion-star">✦</span><strong>${next.years}</strong><span>${next.years === 1 ? "year" : "years"}</span></div>
        <div class="anniversary-card-copy"><span class="anniversary-when">${next.days === 0 ? "Let’s celebrate today!" : when(next.days)}</span><h3>${escape(member.name)}</h3>${member.tagline ? `<p class="member-tagline">${escape(member.tagline)}</p>` : ""}
        <p class="anniversary-date">${next.years}-year anniversary · ${dateHtml(next.date)}</p></div>
      </article>`).join("") || '<div class="member-empty"><h3>Good memories start with a date</h3><p>Anniversaries appear here when current members have recorded join dates.</p></div>';
    const search = $("member-search").value.trim().toLocaleLowerCase();
    const filter = $("member-filter").value;
    const rows = roster.members.filter(member => (!search || member.name.toLocaleLowerCase().includes(search)) &&
      (filter === "all" || (filter === "missing" ? member.status === "current" && !member.joinedOn : member.status === filter)));
    const sort = $("member-sort").value;
    const formerOnly = filter === "former";
    const allMembers = filter === "all";
    const columns = formerOnly ? ["Member", "Joined", "Departed"] : allMembers ? ["Member", "Joined", "Membership"] : ["Member", "Joined", "Years together", "Next anniversary"];
    $("member-columns").innerHTML = columns.map(label => `<th scope="col">${label}</th>`).join("");
    $("member-caption").textContent = formerOnly ? "Former guild members and their joined and departed dates" : allMembers ? "All guild members, join dates, and membership details" : "Current guild members, recorded join dates, and upcoming anniversaries";
    $("member-table").classList.toggle("member-table--former", formerOnly);
    $("join-date-footnote").hidden = !rows.some(member => member.joinedOn && member.joinedOnMayBeEarlier);
    rows.sort((a, b) => {
      if (sort === "joined") return (a.joinedOn || "9999").localeCompare(b.joinedOn || "9999") || a.name.localeCompare(b.name);
      if (sort === "anniversary") return (api.anniversary(a, today)?.days ?? Infinity) - (api.anniversary(b, today)?.days ?? Infinity) || a.name.localeCompare(b.name);
      return a.name.localeCompare(b.name);
    });
    $("member-rows").innerHTML = rows.map(member => {
      const joinDateNote = member.joinedOn && member.joinedOnMayBeEarlier ? `<a class="join-date-reference" href="#join-date-footnote" aria-label="Join date footnote for ${escape(member.name)}" aria-describedby="join-date-footnote">*</a>` : "";
      const identity = `<td><strong>${escape(member.name)}</strong>${member.tagline ? `<span class="member-tagline">${escape(member.tagline)}</span>` : ""}<span class="member-status">${member.status === "former" ? "Former member" : "Current member"}</span></td><td>${recordedDateHtml(member.joinedOn)}${joinDateNote}</td>`;
      if (member.status === "former") return `<tr>${identity}<td>${allMembers ? "Departed " : ""}${recordedDateHtml(member.departedOn)}</td></tr>`;
      const next = api.anniversary(member, today);
      const years = api.completedYears(member.joinedOn, today);
      const yearsLabel = years === null ? "—" : years === 0 ? "Less than a year" : `${years} ${years === 1 ? "year" : "years"}`;
      const nextHtml = next ? `${dateHtml(next.date)}<span class="member-status">${next.years} ${next.years === 1 ? "year" : "years"} · ${when(next.days)}</span>` : "—";
      if (allMembers) return `<tr>${identity}<td>${years !== null ? `<span>${yearsLabel} together</span>` : ""}<span class="member-status">Next anniversary: ${nextHtml}</span></td></tr>`;
      return `<tr>${identity}<td>${yearsLabel}</td><td>${nextHtml}</td></tr>`;
    }).join("") || (roster.members.length ? `<tr><td colspan="${columns.length}">No members match these filters.</td></tr>` : "");
    $("roster-empty").hidden = roster.members.length > 0;
    $("roster-results").textContent = `${rows.length} ${rows.length === 1 ? "member" : "members"}`;
  }
  ["member-search", "member-filter", "member-sort"].forEach(id => $(id).addEventListener("input", render));
  // Recompute on return and across midnight, including Eastern daylight-saving changes.
  document.addEventListener("visibilitychange", () => { if (!document.hidden) render(); });
  setInterval(() => { if (api.todayInGuild() !== today) render(); }, 60000);
  render();
})();
