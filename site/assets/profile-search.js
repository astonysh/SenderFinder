const GENERIC_LABELS = new Set(['www', 'mail', 'com', 'net', 'org', 'io', 'ai', 'co', 'uk', 'de', 'fr', 'cn', 'jp', 'app', 'dev', 'inc', 'ltd', 'group', 'email']);
const companyKeyword = domain => {
  const labels = String(domain || '').toLowerCase().split('.').filter(Boolean);
  const candidates = labels.filter(label => !GENERIC_LABELS.has(label));
  const keyword = (candidates.length ? candidates : labels).sort((a, b) => b.length - a.length)[0] || '';
  return keyword.length >= 2 ? keyword : '';
};

const form = document.getElementById('profile-search-form');

if (form) {
  const email = document.getElementById('profile-search-email');
  const name = document.getElementById('profile-search-name');
  const company = document.getElementById('profile-search-company');
  const result = document.getElementById('profile-search-result');
  const status = document.getElementById('profile-search-status');
  const links = document.getElementById('profile-search-links');
  const sample = document.getElementById('profile-search-sample');
  const personalDomains = new Set(['gmail.com', 'googlemail.com', 'outlook.com', 'hotmail.com', 'live.com', 'icloud.com', 'yahoo.com', 'qq.com', 'proton.me', 'protonmail.com']);
  const roleNames = new Set(['admin', 'billing', 'contact', 'hello', 'info', 'jobs', 'office', 'sales', 'support', 'team']);

  const addRoute = (label, detail, url) => {
    const item = document.createElement('article');
    item.className = 'tool-result-item';
    const heading = document.createElement('h4');
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    anchor.textContent = label;
    heading.append(anchor);
    const text = document.createElement('p');
    text.textContent = detail;
    item.append(heading, text);
    links.append(item);
  };

  const build = () => {
    const address = email.value.trim().toLowerCase();
    const displayName = name.value.trim().replace(/\s+/g, ' ');
    const companyName = company.value.trim().replace(/\s+/g, ' ');
    const match = address.match(/^([^@\s]+)@([^@\s]+\.[^@\s]+)$/);
    if (!match) {
      email.setCustomValidity('Enter a complete email address.');
      email.reportValidity();
      return;
    }
    email.setCustomValidity('');
    const [, local, domain] = match;
    const exactQuery = `"${address}" site:linkedin.com/in`;
    // "acme" from "mail.acme.co.uk": a bare domain in quotes almost never appears on a profile page.
    const companyClue = companyName || companyKeyword(domain) || '';
    const identityParts = [displayName ? `"${displayName}"` : '', companyClue].filter(Boolean);
    const identityQuery = `${identityParts.join(' ')} site:linkedin.com/in`;
    const linkedinQuery = [displayName, companyClue].filter(Boolean).join(' ');

    links.replaceChildren();
    addRoute('Google: exact email', 'Best when the address appears on a public speaker page, personal site or directory.', `https://www.google.com/search?q=${encodeURIComponent(exactQuery)}`);
    addRoute('Google: name + company', 'Compares public LinkedIn profile results using the identity clues you supplied.', `https://www.google.com/search?q=${encodeURIComponent(identityQuery)}`);
    addRoute('Bing: name + company', 'A second index can expose a different set of public profile pages.', `https://www.bing.com/search?q=${encodeURIComponent(identityQuery)}`);
    addRoute('LinkedIn people search', 'Review the headline, location and company before treating any result as the sender.', `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(linkedinQuery || address)}`);

    const warnings = [];
    if (personalDomains.has(domain)) warnings.push('This is a personal mailbox domain, so the company cannot be inferred from it.');
    if (roleNames.has(local)) warnings.push('This looks like a shared role address and may not belong to one person.');
    if (!displayName) warnings.push('Add the sender’s name to narrow common-domain results.');
    status.textContent = warnings.length ? warnings.join(' ') : `Four search routes are ready for ${domain}. Verify the person before using a profile.`;
    result.hidden = false;
  };

  form.addEventListener('submit', event => {
    event.preventDefault();
    build();
  });
  email.addEventListener('input', () => email.setCustomValidity(''));
  sample.addEventListener('click', () => {
    email.value = 'jane.doe@northwind.example';
    name.value = 'Jane Doe';
    company.value = 'Northwind';
    build();
  });
}
