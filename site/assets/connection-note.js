const form = document.getElementById('connection-note-form');

if (form) {
  const fields = {
    name: document.getElementById('connection-name'),
    context: document.getElementById('connection-context'),
    detail: document.getElementById('connection-detail'),
    goal: document.getElementById('connection-goal'),
    tone: document.getElementById('connection-tone'),
  };
  const result = document.getElementById('connection-note-result');
  const options = document.getElementById('connection-note-options');
  const sample = document.getElementById('connection-note-sample');
  const contextText = {
    email: 'your email about', meeting: 'our conversation about', event: 'the event discussion about',
    content: 'your work on', introduction: 'our introduction around', work: 'our work on',
  };
  const goalText = {
    stay: 'I’d like to stay connected.', continue: 'I’d be glad to continue the conversation.',
    learn: 'I’d like to follow your work.', collaborate: 'I’d be glad to explore working together.',
  };

  const clean = value => value.trim().replace(/\s+/g, ' ').replace(/[.!?]+$/, '');
  const shorten = (value, max = 200) => {
    if (value.length <= max) return value;
    const clipped = value.slice(0, max - 1);
    const boundary = clipped.lastIndexOf(' ');
    return `${clipped.slice(0, boundary > 120 ? boundary : max - 1).replace(/[,;:]$/, '')}…`;
  };
  const greeting = name => name ? `Hi ${name}, ` : 'Hi, ';

  const drafts = ({ name, context, detail, goal, tone }) => {
    const hello = greeting(name);
    const reference = `${contextText[context] || 'the shared context around'} ${detail}`;
    const purpose = goalText[goal] || goalText.stay;
    const sets = {
      warm: [
        `${hello}I enjoyed ${reference}. ${purpose}`,
        `${hello}thanks for ${reference}. It would be great to connect, and ${purpose}`,
        `${hello}${reference} stayed with me. ${purpose}`,
      ],
      professional: [
        `${hello}I’m following up on ${reference}. ${purpose}`,
        `${hello}thank you for ${reference}. I’d value connecting here.`,
        `${hello}I appreciated ${reference}. ${purpose}`,
      ],
      concise: [
        `${hello}following up on ${reference}. Let’s connect.`,
        `${hello}thanks for ${reference}. ${purpose}`,
        `${hello}${reference} — glad to connect here.`,
      ],
    };
    return [...new Set((sets[tone] || sets.warm).map(text => shorten(text)))];
  };

  const render = notes => {
    options.replaceChildren();
    notes.forEach((note, index) => {
      const card = document.createElement('article');
      card.className = 'note-option';
      const label = document.createElement('label');
      const id = `connection-note-option-${index + 1}`;
      label.htmlFor = id;
      label.textContent = `Option ${index + 1}`;
      const textarea = document.createElement('textarea');
      textarea.id = id;
      textarea.rows = 4;
      textarea.maxLength = 200;
      textarea.value = note;
      const footer = document.createElement('div');
      footer.className = 'note-option-foot';
      const count = document.createElement('span');
      const updateCount = () => { count.textContent = `${textarea.value.length}/200`; };
      textarea.addEventListener('input', updateCount);
      updateCount();
      const copy = document.createElement('button');
      copy.type = 'button';
      copy.className = 'v2-btn v2-btn--outline v2-btn--sm';
      copy.textContent = 'Copy note';
      copy.addEventListener('click', async () => {
        await navigator.clipboard.writeText(textarea.value);
        copy.textContent = 'Copied';
        window.setTimeout(() => { copy.textContent = 'Copy note'; }, 1400);
      });
      footer.append(count, copy);
      card.append(label, textarea, footer);
      options.append(card);
    });
    result.hidden = false;
  };

  form.addEventListener('submit', event => {
    event.preventDefault();
    const values = Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, clean(field.value)]));
    if (!values.detail) { fields.detail.reportValidity(); return; }
    render(drafts(values));
  });
  sample.addEventListener('click', () => {
    fields.name.value = 'Jane';
    fields.context.value = 'email';
    fields.detail.value = 'privacy-first email enrichment';
    fields.goal.value = 'continue';
    fields.tone.value = 'warm';
    form.requestSubmit();
  });
}
