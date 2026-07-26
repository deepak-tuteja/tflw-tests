import type { DetailedHTMLProps, HTMLAttributes } from 'react';

// Tier C corner (webV2-3, PLAN_WEBV2_TARGETS.md): a real shadow-DOM web component, not a React
// component styled to look like one. Its five star buttons live entirely inside a closed-off
// `shadowRoot` — a plain `document.querySelector('button')` from outside this element finds
// nothing, forcing shadow-piercing traversal. Interaction is exposed the standard web-component
// way: a `value` property (get/set) plus a bubbling, composed `ratingchange` CustomEvent, not a
// React prop — ProductReviewsPage talks to it via a ref and manual event listeners.
const TEMPLATE = document.createElement('template');
TEMPLATE.innerHTML = `
  <style>
    :host { display: inline-flex; gap: 0.15rem; }
    button {
      background: none;
      border: none;
      cursor: pointer;
      font-size: 1.4rem;
      line-height: 1;
      padding: 0;
      color: #ccc;
    }
    button.filled { color: #f5a623; }
    :host([readonly]) button { cursor: default; }
  </style>
  <div part="stars"></div>
`;

export class StarRatingElement extends HTMLElement {
  private _value = 0;
  private container: HTMLDivElement;

  static get observedAttributes() {
    return ['readonly'];
  }

  constructor() {
    super();
    const shadow = this.attachShadow({ mode: 'open' });
    shadow.appendChild(TEMPLATE.content.cloneNode(true));
    this.container = shadow.querySelector('div') as HTMLDivElement;
  }

  connectedCallback() {
    this.render();
  }

  attributeChangedCallback() {
    this.render();
  }

  get value(): number {
    return this._value;
  }

  set value(next: number) {
    this._value = next;
    this.render();
  }

  private render() {
    this.container.innerHTML = '';
    const readonly = this.hasAttribute('readonly');
    for (let i = 1; i <= 5; i += 1) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('aria-label', `${i} star${i === 1 ? '' : 's'}`);
      btn.className = i <= this._value ? 'filled' : '';
      btn.textContent = '★';
      if (readonly) {
        btn.disabled = true;
      } else {
        btn.addEventListener('click', () => {
          this.value = i;
          this.dispatchEvent(
            new CustomEvent('ratingchange', { detail: { value: i }, bubbles: true, composed: true }),
          );
        });
      }
      this.container.appendChild(btn);
    }
  }
}

if (!customElements.get('star-rating')) {
  customElements.define('star-rating', StarRatingElement);
}

type StarRatingProps = DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
  readonly?: boolean;
  value?: number;
};

// React 19's react-jsx transform resolves IntrinsicElements from the `JSX` namespace the `react`
// module itself exports (see node_modules/@types/react/jsx-runtime.d.ts), not a global `JSX`
// namespace, so the augmentation has to target `declare module 'react'` here.
declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'star-rating': StarRatingProps;
    }
  }
}
