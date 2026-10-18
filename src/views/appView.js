export function renderPage({ page, pageViews, navButtons, pageTitle, pageSubtitle, meta }) {
    pageViews.forEach((view) => {
        view.hidden = view.getAttribute('data-page-view') !== page;
    });

    navButtons.forEach((button) => {
        const isActive = button.getAttribute('data-page-target') === page;
        button.classList.toggle('active', isActive);
        if (isActive) button.setAttribute('aria-current', 'page');
        else button.removeAttribute('aria-current');
    });

    pageTitle.textContent = meta.title;
    pageSubtitle.textContent = meta.subtitle;
}
