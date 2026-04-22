(function() {
    function getCurrentLang() {
        return document.body.dataset.initialLanguage || localStorage.getItem('appLang') || 'en';
    }

    function setLanguageVisual(lang) {
        const dict = TRANSLATIONS[lang] || TRANSLATIONS.en;
        document.documentElement.lang = lang;
        document.querySelectorAll('[data-i18n]').forEach(el => {
            const key = el.getAttribute('data-i18n');
            if (dict[key]) {
                el.textContent = dict[key];
            }
        });
        document.querySelectorAll('[data-status-key]').forEach(el => {
            const key = el.getAttribute('data-status-key');
            if (dict[key]) {
                el.textContent = dict[key];
            }
        });
        localStorage.setItem('appLang', lang);
    }

    function formatLocalDateTime(date) {
        const day = date.getDate();
        const month = date.getMonth() + 1;
        const year = date.getFullYear();

        let hours = date.getHours();
        const minutes = String(date.getMinutes()).padStart(2, '0');
        const seconds = String(date.getSeconds()).padStart(2, '0');
        const ampm = hours >= 12 ? 'PM' : 'AM';

        hours = hours % 12;
        hours = hours ? hours : 12;
        const hourText = String(hours).padStart(2, '0');

        return `${day}/${month}/${year}, ${hourText}:${minutes}:${seconds} ${ampm}`;
    }

    function updateClocks() {
        const now = new Date();
        const formatted = formatLocalDateTime(now);

        const localClock = document.getElementById('localClock');
        const loginLocalClock = document.getElementById('loginLocalClock');

        if (localClock) {
            localClock.textContent = formatted;
        }

        if (loginLocalClock) {
            loginLocalClock.textContent = formatted;
        }
    }

    document.addEventListener('DOMContentLoaded', function() {
        setLanguageVisual(getCurrentLang());
        updateClocks();
        setInterval(updateClocks, 1000);
    });
})();
