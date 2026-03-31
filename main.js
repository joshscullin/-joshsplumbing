/*
  ================================================================
  JOSH'S PLUMBING — main.js
  ================================================================

  LEARNING: This file is loaded at the bottom of <body> in index.html.
  Because of that, all HTML elements already exist when this code runs.
  We don't need to wait for a "DOM ready" event — the page is already parsed.

  If this script were in <head>, we'd need:
    document.addEventListener('DOMContentLoaded', function() { ... })
  to delay execution until HTML is parsed. Loading at the bottom of
  <body> avoids that complexity.

  FILE STRUCTURE:
  1.  Utility helpers
  2.  Sticky Navigation
  3.  Mobile Menu (Hamburger)
  4.  Smooth Scroll
  5.  Before/After Slider
  6.  Form Validation
  7.  IntersectionObserver Animations
  8.  Init — calls everything
*/


/* ================================================================
  1. UTILITY HELPERS
  ================================================================

  LEARNING: querySelector is the modern way to select DOM elements.
  It accepts any CSS selector string — the same selectors you write in CSS.
  document.querySelector('#nav')        → first element with id="nav"
  document.querySelector('.btn')        → first element with class="btn"
  document.querySelectorAll('.card')    → ALL elements with class="card"

  querySelector returns null if nothing is found — not an error.
  querySelectorAll returns an empty NodeList — not an error.
  Always check for null before calling methods on the result.
*/

/**
 * Shorthand for document.querySelector.
 * @param {string} selector - Any CSS selector
 * @param {Element} [context=document] - Optional parent to search within
 */
function $(selector, context) {
  return (context || document).querySelector(selector);
}

/**
 * Shorthand for document.querySelectorAll — returns an Array (not a NodeList).
 * LEARNING: querySelectorAll returns a NodeList, which looks like an array
 * but lacks array methods like .map() and .filter(). Wrapping in Array.from()
 * converts it to a real array so we can use those methods.
 */
function $$(selector, context) {
  return Array.from((context || document).querySelectorAll(selector));
}

/**
 * Clamps a number between min and max.
 * LEARNING: Clamping prevents values from going out of bounds.
 * e.g., clamp(0, 150, 100) → 100  (150 exceeds max)
 *        clamp(0, -5, 100) → 0    (-5 is below min)
 */
function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}


/* ================================================================
  2. STICKY NAVIGATION
  ================================================================

  LEARNING: The scroll event fires very frequently — potentially
  hundreds of times per second as the user scrolls. Attaching
  expensive operations directly to scroll events can cause janky
  performance.

  The pattern here is simple and performant:
  - Listen for scroll events on the window
  - Compare window.scrollY (pixels scrolled from top) to a threshold
  - Add or remove a CSS class based on that comparison
  - CSS handles the visual change (background color transition)

  window.scrollY is the number of pixels the page has been scrolled
  vertically from the top. At the very top of the page, it's 0.
*/

function initStickyNav() {
  const nav = $('#nav');
  if (!nav) return; // Guard clause: exit if element not found

  const SCROLL_THRESHOLD = 80; // pixels from top before nav changes

  function handleNavScroll() {
    /*
      classList.toggle(className, condition) adds the class if condition
      is true, removes it if condition is false. Cleaner than:
      if (condition) { el.classList.add(class) } else { el.classList.remove(class) }
    */
    nav.classList.toggle('scrolled', window.scrollY > SCROLL_THRESHOLD);
  }

  // Run once on load in case page is refreshed mid-scroll
  handleNavScroll();

  window.addEventListener('scroll', handleNavScroll, { passive: true });
  /*
    LEARNING: { passive: true } tells the browser this event listener
    will never call event.preventDefault(). This allows the browser to
    optimise scrolling performance — it doesn't need to wait for the
    listener to finish before scrolling the page.
    Always use passive: true on scroll, touchstart, and touchmove listeners
    when you're not preventing default behaviour.
  */
}


/* ================================================================
  3. MOBILE MENU (HAMBURGER)
  ================================================================

  LEARNING: The hamburger menu pattern:
  1. Button click toggles an .open class on both the button and menu
  2. CSS handles the visual change (max-height animation, X icon)
  3. Accessibility attributes (aria-expanded) are updated to inform
     screen readers of the menu state

  Key concepts:
  - classList.toggle() — adds class if absent, removes if present
  - setAttribute() — sets an HTML attribute by name and value
  - Closing the menu when a link is clicked (expected UX behavior)
  - Closing the menu when clicking outside of it
*/

function initMobileMenu() {
  const hamburger = $('#hamburger');
  const navLinks = $('#nav-links');
  if (!hamburger || !navLinks) return;

  // Create and insert the mobile menu container
  /*
    LEARNING: We dynamically create the mobile menu here rather than
    having it in the HTML. This keeps the HTML clean — the mobile menu
    is a progressive enhancement, created only when the script runs.

    createElement creates a new DOM element that isn't in the page yet.
    appendChild attaches it as a child of the specified parent.
    innerHTML sets the element's HTML content as a string.
  */
  const mobileMenu = document.createElement('div');
  mobileMenu.className = 'nav__mobile-menu';
  mobileMenu.id = 'mobile-menu';
  mobileMenu.innerHTML = `
    <ul role="list">
      <li><a href="#services">Services</a></li>
      <li><a href="#before-after">Before & After</a></li>
      <li><a href="#testimonials">Reviews</a></li>
      <li><a href="#contact">Contact</a></li>
      <li><a href="tel:5551234567" class="btn btn--accent">Call (555) 123-4567</a></li>
    </ul>
  `;

  // Insert mobile menu immediately after the <nav> element
  const nav = $('#nav');
  nav.parentNode.insertBefore(mobileMenu, nav.nextSibling);

  let isOpen = false;

  function openMenu() {
    isOpen = true;
    hamburger.classList.add('open');
    mobileMenu.classList.add('open');
    hamburger.setAttribute('aria-expanded', 'true');
    hamburger.setAttribute('aria-label', 'Close navigation menu');
    // Prevent background scrolling while menu is open
    document.body.style.overflow = 'hidden';
  }

  function closeMenu() {
    isOpen = false;
    hamburger.classList.remove('open');
    mobileMenu.classList.remove('open');
    hamburger.setAttribute('aria-expanded', 'false');
    hamburger.setAttribute('aria-label', 'Open navigation menu');
    document.body.style.overflow = '';
  }

  // Toggle on hamburger click
  hamburger.addEventListener('click', function() {
    isOpen ? closeMenu() : openMenu();
  });

  // Close when any link inside the mobile menu is clicked
  /*
    LEARNING: Event delegation — instead of attaching a listener to every
    single <a> tag, we attach ONE listener to the parent container.
    When a click happens inside it, the event "bubbles up" through the DOM
    to our listener. We check event.target (what was actually clicked)
    to see if it's a link.

    This is more efficient and also works for dynamically added elements.
  */
  mobileMenu.addEventListener('click', function(event) {
    if (event.target.tagName === 'A') {
      closeMenu();
    }
  });

  // Close when clicking outside the nav/menu
  document.addEventListener('click', function(event) {
    if (!isOpen) return;
    if (!nav.contains(event.target) && !mobileMenu.contains(event.target)) {
      closeMenu();
    }
  });

  // Close on Escape key — keyboard accessibility
  /*
    LEARNING: Keyboard accessibility requires handling Escape key for
    any element that opens/overlays content (menus, modals, drawers).
    Users navigating by keyboard expect Escape to close overlays.
    event.key gives us the key name as a string.
  */
  document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape' && isOpen) {
      closeMenu();
      hamburger.focus(); // Return focus to the button that opened the menu
    }
  });
}


/* ================================================================
  4. SMOOTH SCROLL
  ================================================================

  LEARNING: CSS scroll-behavior: smooth handles basic smooth scrolling,
  but it doesn't account for the sticky nav bar height. If we scroll to
  #services, the section header ends up hidden behind the nav.

  This JS version:
  1. Intercepts all anchor link clicks
  2. Calculates the target element's position
  3. Subtracts the nav height as an offset
  4. Uses window.scrollTo() with smooth behavior

  getBoundingClientRect() returns the position of an element relative
  to the current viewport. Adding window.scrollY converts it to an
  absolute position on the page.
*/

function initSmoothScroll() {
  const navHeight = parseInt(
    getComputedStyle(document.documentElement).getPropertyValue('--nav-height'),
    10
  ) || 68;
  /*
    LEARNING: getComputedStyle reads the actual computed CSS value of a property.
    getPropertyValue reads CSS custom properties (--variables).
    This means our JS and CSS stay in sync — we defined nav height once in CSS,
    and JS reads that value rather than hardcoding 68 in two places.
  */

  document.addEventListener('click', function(event) {
    // Walk up the DOM tree from the click target to find an <a> element
    const link = event.target.closest('a[href^="#"]');
    /*
      LEARNING: closest() walks up the DOM from an element, checking each
      ancestor against a CSS selector. It returns the first match or null.
      'a[href^="#"]' means: an <a> element whose href starts with "#"
      ^ = starts with  |  $ = ends with  |  * = contains
    */

    if (!link) return;

    const targetId = link.getAttribute('href');
    if (targetId === '#') return; // Skip empty hash links

    const target = document.querySelector(targetId);
    if (!target) return;

    event.preventDefault(); // Stop the default jump-to behavior

    const targetTop = target.getBoundingClientRect().top + window.scrollY;
    const offsetPosition = targetTop - navHeight - 16; // 16px extra breathing room

    window.scrollTo({
      top: offsetPosition,
      behavior: 'smooth'
    });
  });
}


/* ================================================================
  5. BEFORE/AFTER SLIDER
  ================================================================

  LEARNING: This is the most complex JavaScript in the project.
  It demonstrates several important concepts:

  A) Mouse AND touch event handling (needed for mobile support)
  B) Calculating position relative to an element using getBoundingClientRect()
  C) Updating CSS properties via element.style (inline styles)
  D) State management with a simple isDragging boolean
  E) Event cleanup — removing mousemove/mouseup from document when done

  The slider works by:
  1. The "after" image has clip-path: inset(0 X% 0 0)
     This hides the right X% of the image, revealing the "before" behind it
  2. The handle is positioned at left: X%
  3. As you drag, we recalculate X% from cursor position
  4. We update both clip-path and handle position to match

  clip-path: inset(top right bottom left) clips a rectangle into the element.
  inset(0 50% 0 0) = clip 50% from the right. Half the after image is hidden.
  inset(0 0% 0 0)  = clip 0% from the right. Full after image visible.
  inset(0 100% 0 0) = clip 100% from the right. After image fully hidden.
*/

function initBeforeAfterSliders() {
  const sliders = $$('[data-slider]');

  sliders.forEach(function(slider) {
    const afterImg = $('.ba-img--after', slider);
    const handle = $('.ba-handle', slider);

    if (!afterImg || !handle) return;

    let isDragging = false;
    let currentPosition = 50; // Start at 50%

    // Set initial position
    updateSlider(currentPosition);

    function updateSlider(percent) {
      // Clamp between 5% and 95% so handle doesn't disappear off edges
      currentPosition = clamp(percent, 5, 95);

      // Update the after image clip — hide everything to the RIGHT of our position
      afterImg.style.clipPath = `inset(0 ${100 - currentPosition}% 0 0)`;
      /*
        LEARNING: Template literals (backtick strings with ${expression}) let
        you embed JavaScript expressions inside strings. Much cleaner than:
        'inset(0 ' + (100 - currentPosition) + '% 0 0)'
      */

      // Move the handle to the same position
      handle.style.left = `${currentPosition}%`;
    }

    function getPositionPercent(clientX) {
      /*
        getBoundingClientRect() returns the size and position of an element
        relative to the VIEWPORT (not the document).
        rect.left = left edge position from left side of screen
        rect.width = element's width in pixels

        clientX = cursor X position from left of viewport

        So (clientX - rect.left) = pixels from left edge of our slider
        Dividing by rect.width and multiplying by 100 = percentage across the slider
      */
      const rect = slider.getBoundingClientRect();
      return ((clientX - rect.left) / rect.width) * 100;
    }

    /* ---- Mouse events ---- */

    slider.addEventListener('mousedown', function(event) {
      event.preventDefault(); // Prevent image dragging behaviour
      isDragging = true;
      slider.style.cursor = 'grabbing';
    });

    /*
      LEARNING: mousemove and mouseup are attached to document, not the slider.
      Why? If you move the mouse faster than the slider updates (easy to do),
      the cursor leaves the slider element. If listeners were on the slider,
      dragging would stop the moment you moved too fast.
      On document, events fire as long as the mouse moves anywhere on the page.
    */
    document.addEventListener('mousemove', function(event) {
      if (!isDragging) return;
      updateSlider(getPositionPercent(event.clientX));
    });

    document.addEventListener('mouseup', function() {
      if (!isDragging) return;
      isDragging = false;
      slider.style.cursor = 'ew-resize';
    });

    /* ---- Touch events (mobile) ---- */
    /*
      LEARNING: Mobile devices use a separate set of events: touchstart,
      touchmove, touchend. They are NOT the same as mouse events.
      Touch events have a .touches array (multi-touch support).
      .touches[0].clientX gives us the X position of the first touch point.
    */

    slider.addEventListener('touchstart', function(event) {
      isDragging = true;
    }, { passive: true }); // passive: true — we won't prevent default scroll

    slider.addEventListener('touchmove', function(event) {
      if (!isDragging) return;
      event.preventDefault(); // Prevent page scroll while dragging the slider
      const touch = event.touches[0];
      updateSlider(getPositionPercent(touch.clientX));
    }, { passive: false }); // passive: false — we DO call preventDefault here

    slider.addEventListener('touchend', function() {
      isDragging = false;
    });

    /* ---- Click on slider (instant jump) ---- */
    slider.addEventListener('click', function(event) {
      // Only jump if not dragging (would conflict with drag end)
      if (!isDragging) {
        updateSlider(getPositionPercent(event.clientX));
      }
    });
  });
}


/* ================================================================
  6. FORM VALIDATION
  ================================================================

  LEARNING: Form validation teaches the core DOM manipulation pattern:
  1. Select elements
  2. Read their values (.value property)
  3. Validate the values
  4. Update the DOM based on validation results (add classes, show messages)
  5. Handle the success state

  Key concepts demonstrated:
  - event.preventDefault() stops the default form submission (page reload)
  - .trim() removes leading/trailing whitespace before checking if empty
  - Regex for phone number validation
  - The DRY principle — a helper function avoids repeating validation logic
*/

function initFormValidation() {
  const form = $('#callback-form');
  const successMessage = $('#form-success');

  if (!form) return;

  /*
    LEARNING: This helper function handles the repetitive work of
    showing/hiding error states. Without it, we'd repeat 4-5 lines
    for each of the 3 form fields.
  */
  function showError(inputId, errorId, message) {
    const input = $(`#${inputId}`);
    const error = $(`#${errorId}`);
    if (!input || !error) return;

    input.classList.add('error');   // Adds red border via CSS
    error.textContent = message;   // Sets the error text
    error.classList.add('visible'); // Makes the error span visible
  }

  function clearError(inputId, errorId) {
    const input = $(`#${inputId}`);
    const error = $(`#${errorId}`);
    if (!input || !error) return;

    input.classList.remove('error');
    error.textContent = '';
    error.classList.remove('visible');
  }

  function clearAllErrors() {
    clearError('name', 'name-error');
    clearError('phone', 'phone-error');
    clearError('email', 'email-error');
    clearError('service', 'service-error');
  }

  // Live validation — clear error as user types/changes a field
  /*
    LEARNING: Good UX means clearing an error as soon as the user starts
    fixing it. We don't wait for them to re-submit. The 'input' event fires
    every time the value changes (typing, pasting, etc).
    The 'change' event fires when a <select> value changes.
  */
  $('#name').addEventListener('input', function() {
    if (this.value.trim()) clearError('name', 'name-error');
  });

  $('#phone').addEventListener('input', function() {
    if (this.value.trim()) clearError('phone', 'phone-error');
  });

  $('#email').addEventListener('input', function() {
    if (this.value.trim()) clearError('email', 'email-error');
  });

  $('#service').addEventListener('change', function() {
    if (this.value) clearError('service', 'service-error');
  });

  form.addEventListener('submit', function(event) {
    /*
      LEARNING: event.preventDefault() is critical here.
      Without it, the form would submit to the server (or reload the page
      if no action attribute is set). We want to handle submission ourselves
      with JavaScript — so we prevent the default behaviour first.
    */
    event.preventDefault();

    clearAllErrors();

    const nameInput    = $('#name');
    const phoneInput   = $('#phone');
    const emailInput   = $('#email');
    const serviceInput = $('#service');
    const messageInput = $('#message');
    const submitBtn    = form.querySelector('[type="submit"]');

    let hasErrors = false;

    // Validate name
    if (!nameInput.value.trim()) {
      showError('name', 'name-error', '&#10007; Please enter your name');
      hasErrors = true;
    }

    // Validate phone
    const phoneValue = phoneInput.value.trim();
    /*
      LEARNING: Regular expressions (regex) are patterns for matching strings.
      /[0-9]/g matches any digit character (0-9). The g flag = "global" (find all).
      .match() returns an array of matches, or null if none found.
      The optional chaining (?.) on .length prevents an error if match() returns null.

      This logic: remove all non-digit characters, check if at least 8 remain.
      Handles formats: "0412 345 678", "(02) 9876 5432", "0412-345-678"
    */
    const digitsOnly = phoneValue.replace(/[^0-9]/g, '');
    if (!phoneValue) {
      showError('phone', 'phone-error', '&#10007; Please enter your phone number');
      hasErrors = true;
    } else if (digitsOnly.length < 8) {
      showError('phone', 'phone-error', '&#10007; Please enter a valid phone number');
      hasErrors = true;
    }

    // Validate email
    const emailValue = emailInput.value.trim();
    /*
      LEARNING: This regex is a basic email format check.
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/ breaks down as:
      ^ = start of string
      [^\s@]+ = one or more characters that are NOT a space or @
      @ = a literal @ symbol
      [^\s@]+ = one or more characters (the domain name)
      \. = a literal dot
      [^\s@]+$ = one or more characters (the extension, e.g. "com")
      It catches obvious mistakes like missing @ or missing dot.
    */
    if (!emailValue) {
      showError('email', 'email-error', '&#10007; Please enter your email address');
      hasErrors = true;
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue)) {
      showError('email', 'email-error', '&#10007; Please enter a valid email address');
      hasErrors = true;
    }

    // Validate service selection
    if (!serviceInput.value) {
      showError('service', 'service-error', '&#10007; Please select a service');
      hasErrors = true;
    }

    // If any errors, focus the first invalid field and stop
    if (hasErrors) {
      /*
        LEARNING: querySelector with .error finds the first field that has
        the error class. Calling .focus() on it moves keyboard/screen reader
        focus to that field, which is the accessible pattern for form errors.
      */
      const firstError = form.querySelector('.form-input.error');
      if (firstError) firstError.focus();
      return;
    }

    // All valid — send to the server
    /*
      LEARNING: fetch() is the browser's built-in tool for making HTTP requests
      from JavaScript — without reloading the page. This is called an AJAX request.

      We pass it:
      - The URL to send to ('/api/contact' on our Express server)
      - method: 'POST' because we're submitting data (not just reading it)
      - headers: tells the server the body is JSON
      - body: JSON.stringify() converts our JS object into a JSON string

      fetch() returns a Promise — a placeholder for a value we don't have yet.
      .then() runs when the request completes. .catch() runs if the network fails.
    */
    submitBtn.disabled = true;
    submitBtn.textContent = 'Sending\u2026';

    fetch('/api/contact', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name:    nameInput.value.trim(),
        phone:   phoneInput.value.trim(),
        email:   emailInput.value.trim(),
        service: serviceInput.value,
        message: messageInput ? messageInput.value.trim() : ''
      })
    })
    .then(function(response) {
      /*
        LEARNING: fetch() only rejects (triggers .catch) on a network failure —
        like being offline. A 400 or 500 error from the server still "succeeds"
        as far as fetch is concerned. We check response.ok (true for status 200-299)
        to detect server-side errors ourselves.
      */
      if (!response.ok) {
        throw new Error('Server error');
      }
      return response.json();
    })
    .then(function() {
      // Success — fade the form out and show the confirmation message
      form.style.transition = 'opacity 250ms ease';
      form.style.opacity = '0';

      setTimeout(function() {
        form.hidden = true;
        form.style.opacity = '';
        form.style.transition = '';

        if (successMessage) {
          successMessage.hidden = false;
          successMessage.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      }, 260);
    })
    .catch(function() {
      // Something went wrong — re-enable the button so they can try again
      submitBtn.disabled = false;
      submitBtn.textContent = 'Request Callback \u2192';
      alert('Sorry, something went wrong. Please try again or call us directly.');
    });
  });
}


/* ================================================================
  7. INTERSECTION OBSERVER ANIMATIONS
  ================================================================

  LEARNING: IntersectionObserver is a browser API that watches whether
  elements are visible in the viewport. When they cross the visibility
  threshold, it fires a callback.

  Before this API (circa 2016), developers calculated scroll position
  manually on every scroll event, compared it to every element's offset,
  and showed/hid elements. This ran on every scroll event — potentially
  hundreds of times per second — and was notoriously slow.

  IntersectionObserver runs only when visibility changes. The browser
  handles the heavy lifting off the main thread. Much more performant.

  The API:
  new IntersectionObserver(callback, options)

  callback receives an array of entries — each representing one observed element.
  entry.isIntersecting = true when the element has entered the viewport.
  entry.target = the element being observed.

  threshold: 0.15 = fire when 15% of the element is visible.
*/

function initScrollAnimations() {
  const animatedElements = $$('.animate-on-scroll');

  if (animatedElements.length === 0) return;

  /*
    LEARNING: Check if the browser supports IntersectionObserver.
    Older browsers (IE11) don't have it. This guard prevents an error.
    Modern best practice: feature detection over browser detection.
    Check if the feature exists before using it.
  */
  if (!('IntersectionObserver' in window)) {
    // Fallback for unsupported browsers: make everything visible
    animatedElements.forEach(function(el) {
      el.classList.add('visible');
    });
    return;
  }

  const observer = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        /*
          LEARNING: unobserve() stops watching an element after it's animated.
          We only need the animation to happen once (on the way in).
          Continuing to watch elements that are already animated wastes resources.
        */
        observer.unobserve(entry.target);
      }
    });
  }, {
    threshold: 0.12,     // Trigger when 12% of the element is visible
    rootMargin: '0px'    // No margin adjustment around the viewport
  });

  // Observe every element with the .animate-on-scroll class
  animatedElements.forEach(function(el) {
    observer.observe(el);
  });
}


/* ================================================================
  8. INIT — WIRE EVERYTHING UP
  ================================================================

  LEARNING: Organising each feature into its own function, then calling
  them all from one init() function, is a clean architecture pattern.

  Benefits:
  - Each function is self-contained and easy to debug
  - You can comment out one line to disable a feature
  - Functions can be tested independently
  - Code is readable top to bottom — initStickyNav does one thing

  An alternative pattern is to wrap everything in one giant
  DOMContentLoaded listener. Avoid that — it creates a 300-line
  anonymous function that's hard to navigate and impossible to test.
*/

function init() {
  initStickyNav();
  initMobileMenu();
  initSmoothScroll();
  initBeforeAfterSliders();
  initFormValidation();
  initScrollAnimations();

  /*
    LEARNING: console.log() writes to the browser's Developer Tools console.
    Open it with F12 → Console tab. This is your primary debugging tool.
    You can inspect values, trace errors, and test expressions interactively.
    Remove or comment out console.log calls before shipping to production.
  */
  console.log('Josh\'s Plumbing — page scripts initialised.');
}

// Run init when the script executes (we're at the bottom of <body>, so DOM is ready)
init();


/*
  ================================================================
  CLOSING NOTES FOR LEARNERS
  ================================================================

  Patterns used in this file worth understanding deeply:

  1. GUARD CLAUSES
     Functions start with: if (!element) return;
     This exits early if something isn't found, rather than letting
     the rest of the function crash with "Cannot read property of null."
     It's cleaner than wrapping everything in an if/else.

  2. EVENT DELEGATION
     One listener on a parent, checking event.target, rather than
     listeners on every child. See mobile menu link click handling.

  3. SEPARATION OF STATE AND PRESENTATION
     JavaScript manages state (isDragging, isOpen).
     CSS manages presentation (what .open looks like, what .error looks like).
     Never mix them — don't write inline styles for state changes if a
     CSS class can handle it.

  4. PROGRESSIVE ENHANCEMENT
     The IntersectionObserver fallback (making everything visible if the API
     isn't supported) means the page works everywhere, just without animations
     on old browsers. Core content and functionality always work.

  5. PASSIVE EVENT LISTENERS
     { passive: true } on scroll/touch listeners tells the browser you won't
     call preventDefault(), allowing it to optimise scrolling performance.

  6. TEMPLATE LITERALS
     Backtick strings with ${expression} are cleaner than string concatenation.
     Used throughout for building CSS property values and HTML strings.
*/
