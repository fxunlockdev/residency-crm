/**
 * Residency First — website lead capture.
 *
 * Drop this on the marketing site:
 *   <script src="https://crm.residencyfirst.com/rf-lead.js"
 *           data-endpoint="https://crm.residencyfirst.com/api/leads/intake"
 *           data-token="PUBLIC_FORM_TOKEN"
 *           data-form="#enquiry-form" defer></script>
 *
 * It stores the GCLID and UTM parameters in a first-party cookie for 90 days so the
 * attribution survives navigation, then posts the enquiry to the CRM on submit.
 *
 * Consent: in the UK and EU the cookie is only written once Google Consent Mode v2
 * reports analytics_storage as granted. Without consent the form still submits — it
 * simply carries no click id.
 */
(function () {
  'use strict';

  var script = document.currentScript;
  var ENDPOINT = (script && script.dataset.endpoint) || '/api/leads/intake';
  var TOKEN = (script && script.dataset.token) || '';
  var FORM_SELECTOR = (script && script.dataset.form) || 'form[data-rf-lead]';
  var COOKIE = 'rf_attr';
  var NINETY_DAYS = 90 * 24 * 60 * 60;
  var TRACKED = [
    'gclid',
    // Numeric campaign id from the {campaignid} ValueTrack parameter. Campaign
    // names get renamed; the id does not, so this is what spend joins on.
    'campaignid',
    'utm_source',
    'utm_medium',
    'utm_campaign',
    'utm_term',
    'keyword',
  ];

  function readCookie(name) {
    var match = document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]*)'));
    if (!match) return null;
    try {
      return JSON.parse(decodeURIComponent(match[1]));
    } catch (error) {
      return null;
    }
  }

  function writeCookie(name, value) {
    var secure = location.protocol === 'https:' ? '; Secure' : '';
    document.cookie =
      name +
      '=' +
      encodeURIComponent(JSON.stringify(value)) +
      '; Max-Age=' +
      NINETY_DAYS +
      '; Path=/; SameSite=Lax' +
      secure;
  }

  /** True when Consent Mode v2 has granted analytics storage, or when no CMP is present. */
  function hasConsent() {
    if (typeof window.rfConsentGranted === 'boolean') return window.rfConsentGranted;
    var consent = window.google_tag_data && window.google_tag_data.ics && window.google_tag_data.ics.entries;
    if (!consent) return true; // No Consent Mode on the page.
    var analytics = consent.analytics_storage;
    if (!analytics) return true;
    return analytics.update === true || analytics.default === true;
  }

  function captureFromUrl() {
    var params = new URLSearchParams(location.search);
    var found = {};
    var any = false;
    TRACKED.forEach(function (key) {
      var value = params.get(key);
      if (value) {
        found[key] = value.slice(0, 200);
        any = true;
      }
    });
    if (!any) return null;
    found.landing_page = location.href.slice(0, 600);
    found.captured_at = new Date().toISOString();
    return found;
  }

  function attribution() {
    var fresh = captureFromUrl();
    if (fresh && hasConsent()) {
      writeCookie(COOKIE, fresh);
      return fresh;
    }
    if (fresh) return fresh; // Usable for this page view, but not persisted.
    return readCookie(COOKIE) || {};
  }

  function value(form, names) {
    for (var i = 0; i < names.length; i += 1) {
      var field = form.elements.namedItem(names[i]);
      if (field && typeof field.value === 'string' && field.value.trim() !== '') return field.value.trim();
    }
    return '';
  }

  function checked(form, names) {
    for (var i = 0; i < names.length; i += 1) {
      var field = form.elements.namedItem(names[i]);
      if (field && typeof field.checked === 'boolean') return field.checked;
    }
    return false;
  }

  function submit(form, event) {
    var attr = attribution();
    var payload = {
      fullName: value(form, ['fullName', 'name', 'full_name']),
      email: value(form, ['email']),
      phone: value(form, ['phone', 'whatsapp', 'telephone']),
      countryOfResidence: value(form, ['countryOfResidence', 'country']),
      countryOfBirth: value(form, ['countryOfBirth', 'country_of_birth']),
      message: value(form, ['message', 'enquiry', 'comments']),
      marketingConsent: checked(form, ['marketingConsent', 'consent', 'optin']),
      company_website: value(form, ['company_website']),
      gclid: attr.gclid || '',
      adCampaignId: attr.campaignid || '',
      utmSource: attr.utm_source || '',
      utmMedium: attr.utm_medium || '',
      utmCampaign: attr.utm_campaign || '',
      keyword: attr.keyword || attr.utm_term || '',
      landingPage: attr.landing_page || location.href.slice(0, 600),
    };

    if (!payload.fullName) return; // Let native validation handle it.
    event.preventDefault();

    var headers = { 'Content-Type': 'application/json' };
    if (TOKEN) headers['x-rf-token'] = TOKEN;

    fetch(ENDPOINT, { method: 'POST', headers: headers, body: JSON.stringify(payload), mode: 'cors' })
      .then(function (response) {
        return response.json().catch(function () {
          return {};
        });
      })
      .then(function (result) {
        form.dispatchEvent(new CustomEvent('rf:lead', { detail: result, bubbles: true }));
        if (form.dataset.rfRedirect) location.href = form.dataset.rfRedirect;
        else form.reset();
      })
      .catch(function (error) {
        form.dispatchEvent(new CustomEvent('rf:lead-error', { detail: error, bubbles: true }));
      });
  }

  function bind() {
    attribution(); // Persist on first page view even if the visitor never submits.
    var forms = document.querySelectorAll(FORM_SELECTOR);
    Array.prototype.forEach.call(forms, function (form) {
      if (form.dataset.rfBound) return;
      form.dataset.rfBound = '1';
      form.addEventListener('submit', function (event) {
        submit(form, event);
      });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();

  window.rfLead = { attribution: attribution, bind: bind };
})();
