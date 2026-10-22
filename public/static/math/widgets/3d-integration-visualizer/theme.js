(function() {
    function setTheme(theme) {
        try {
            var root = document.documentElement;
            root.classList.remove('theme-light', 'theme-dark');
            root.classList.add('theme-' + theme);
            root.setAttribute('data-theme', theme);
            try { localStorage.setItem('theme', theme); } catch (e) {}
            document.cookie = 'theme=' + encodeURIComponent(theme) + '; path=/; max-age=31536000';
            var btn = document.getElementById('themeToggle');
            if (btn) {
                btn.textContent = theme === 'dark' ? '☀︎' : '☾';
                btn.title = theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme';
                btn.setAttribute('aria-label', btn.title);
            }
        } catch (e) {}
    }

    function initThemeToggle() {
        var btn = document.getElementById('themeToggle');
        if (!btn) return;
        var current = (document.documentElement.getAttribute('data-theme')) || 'light';
        setTheme(current);
        btn.addEventListener('click', function() {
            var now = (document.documentElement.getAttribute('data-theme')) || 'light';
            setTheme(now === 'dark' ? 'light' : 'dark');
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initThemeToggle);
    } else {
        initThemeToggle();
    }
})();


