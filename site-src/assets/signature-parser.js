const form = document.getElementById('signature-parser-form');

if (form) {
  const input = document.getElementById('signature-input');
  const result = document.getElementById('signature-parser-result');
  const summary = document.getElementById('signature-parser-summary');
  const fields = document.getElementById('signature-parser-fields');
  const sample = document.getElementById('signature-parser-sample');
  const copyJson = document.getElementById('signature-copy-json');
  let parsed = {};

  const unique = values => [...new Set(values.map(value => value.trim()).filter(Boolean))];
  const trimUrl = value => value.replace(/&amp;/g, '&').replace(/[),.;:'"<>]+$/g, '');
  const parse = source => {
    const htmlLinks = [...source.matchAll(/href\s*=\s*["']([^"']+)["']/gi)].map(match => match[1]);
    const plain = source.replace(/<br\s*\/?\s*>/gi, '\n').replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ');
    const rawUrls = plain.match(/https?:\/\/[^\s<>"']+/gi) || [];
    // Bare profile links without a scheme, e.g. "linkedin.com/in/jane" or "twitter.com/jane".
    const bareUrls = (plain.match(/(?<![\w@/.])(?:www\.)?(?:linkedin\.com\/in|twitter\.com|x\.com)\/[^\s<>"']+/gi) || [])
      .map(url => `https://${url.replace(/^www\./i, 'www.')}`);
    const urls = unique([...htmlLinks, ...rawUrls, ...bareUrls].filter(url => /^https?:\/\//i.test(url)).map(trimUrl));
    const emails = unique(plain.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi) || []);
    const phones = unique((plain.match(/(?:\+?\d[\d\s().-]{7,}\d)/g) || []).map(value => value.replace(/\s+/g, ' ')));
    const linkedIn = urls.filter(url => /(?:www\.)?linkedin\.com\/in\//i.test(url));
    const social = urls.filter(url => /(?:twitter\.com|x\.com)\//i.test(url));
    const websites = urls.filter(url => !linkedIn.includes(url) && !social.includes(url));
    const signOff = /^(?:(?:best|kind|warm)\s+(?:regards|wishes)|regards|thanks|thank you|cheers|sincerely|best|yours(?:\s+\w+)?|sent from .*|--+)[,.!]?$/i;
    const urlLines = urls.map(url => url.replace(/^https?:\/\/(?:www\.)?/i, ''));
    const candidates = plain.split(/\n|\s{2,}/).map(line => line.trim()).filter(line => line && line.length < 100 && !signOff.test(line))
      .filter(line => !emails.some(email => line.includes(email)) && !urlLines.some(url => line.includes(url)) && !phones.some(phone => line.includes(phone)));
    // "Partnerships Lead · Northwind Labs", "CTO | Acme", "Designer at Studio" → role + company on one line.
    const roleLine = candidates[1] || '';
    const split = roleLine.split(/\s+(?:[·•|–—]|at|@)\s+/i).map(part => part.trim()).filter(Boolean);
    const possibleRole = split[0] || '';
    const possibleCompany = split.length > 1 ? split.slice(1).join(' ') : (candidates[2] || '');
    return {
      possibleName: candidates[0] || '', possibleRole, possibleCompany,
      emails, phones, linkedIn, social, websites,
    };
  };

  const renderValue = (container, value, link = false) => {
    const values = Array.isArray(value) ? value : value ? [value] : [];
    if (!values.length) { container.textContent = 'Not found'; return; }
    values.forEach((item, index) => {
      if (index) container.append(document.createElement('br'));
      if (link) {
        const anchor = document.createElement('a');
        anchor.href = item;
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';
        anchor.textContent = item;
        container.append(anchor);
      } else container.append(document.createTextNode(item));
    });
  };

  const render = data => {
    fields.replaceChildren();
    const rows = [
      ['Possible name', data.possibleName], ['Possible role', data.possibleRole], ['Possible company', data.possibleCompany],
      ['Email addresses', data.emails], ['Phone numbers', data.phones], ['LinkedIn profiles', data.linkedIn, true],
      ['X / Twitter profiles', data.social, true], ['Other websites', data.websites, true],
    ];
    rows.forEach(([label, value, link]) => {
      const row = document.createElement('div');
      row.className = 'parser-row';
      const term = document.createElement('strong');
      term.textContent = label;
      const body = document.createElement('div');
      renderValue(body, value, link);
      row.append(term, body);
      fields.append(row);
    });
    const found = data.emails.length + data.phones.length + data.linkedIn.length + data.social.length + data.websites.length;
    summary.textContent = `${found} contact value${found === 1 ? '' : 's'} found. Name, role and company are best-effort line guesses—verify them before use.`;
    result.hidden = false;
  };

  form.addEventListener('submit', event => {
    event.preventDefault();
    parsed = parse(input.value);
    render(parsed);
  });
  sample.addEventListener('click', () => {
    input.value = 'Jane Doe\nPartnerships Lead · Northwind Labs\njane.doe@northwind.example\n+1 202 555 0147\nhttps://www.linkedin.com/in/jane-doe-example\nhttps://northwind.example';
    form.requestSubmit();
  });
  form.addEventListener('reset', () => {
    window.setTimeout(() => { result.hidden = true; fields.replaceChildren(); parsed = {}; }, 0);
  });
  copyJson.addEventListener('click', async () => {
    await navigator.clipboard.writeText(JSON.stringify(parsed, null, 2));
    copyJson.textContent = 'Copied';
    window.setTimeout(() => { copyJson.textContent = 'Copy as JSON'; }, 1400);
  });
}
