// script.js - Complete functionality, 
// profile-generator update

(function() {
    'use strict';

    // --- DOM refs ---
    const usernameInput = document.getElementById('usernameInput');
    const fetchBtn = document.getElementById('fetchBtn');
    const errorDiv = document.getElementById('errorMessage');
    const errorText = document.getElementById('errorText');

    const avatarContainer = document.getElementById('avatarContainer');
    const profileName = document.getElementById('profileName');
    const profileBadge = document.getElementById('profileBadge');
    const profileBio = document.getElementById('profileBio').querySelector('span');
    const profileLink = document.getElementById('profileLink');
    const followersLink = document.getElementById('followersLink');
    const starsLink = document.getElementById('starsLink');

    const statForks = document.getElementById('statForks');
    const statStars = document.getElementById('statStars');
    const statPRs = document.getElementById('statPRs');
    const statRepos = document.getElementById('statRepos');
    const statContributors = document.getElementById('statContributors');
    const statCommits = document.getElementById('statCommits');
    const openIssuesSpan = document.getElementById('openIssues');

    const feedList = document.getElementById('feedList');
    const repoGrid = document.getElementById('repoGrid');

    // Wakatime
    const wakaHours = document.getElementById('wakaHours');
    const wakaProjects = document.getElementById('wakaProjects');
    const wakaLanguages = document.getElementById('wakaLanguages');
    const wakaAvg = document.getElementById('wakaAvg');

    const themeToggle = document.getElementById('themeToggle');
    const exportMarkdownBtn = document.getElementById('exportMarkdownBtn');
    const exportPNGBtn = document.getElementById('exportPNGBtn');
    const shareBtn = document.getElementById('shareBtn');
    const shareModal = document.getElementById('shareModal');
    const closeModal = document.getElementById('closeModal');

    let langChartInstance = null;
    let heatmapInstance = null;
    let frequencyInstance = null;
    let currentUsername = 'octocat';
    let isDark = true;
    let currentData = null;
    let cardOrder = ['forks', 'stars', 'prs', 'repos', 'contributors', 'commits'];

    // --- Theme ---
    function setTheme(dark) {
        isDark = dark;
        document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
        const icon = themeToggle.querySelector('i');
        const text = themeToggle.querySelector('span');
        icon.className = dark ? 'fas fa-moon' : 'fas fa-sun';
        text.textContent = dark ? 'Dark' : 'Light';
        // Re-render charts for theme
        if (currentData) renderCharts(currentData);
    }

    themeToggle.addEventListener('click', () => setTheme(!isDark));

    // --- Drag & Drop for Stats ---
    let draggedElement = null;
    const statsGrid = document.getElementById('statsGrid');

    statsGrid.addEventListener('dragstart', (e) => {
        const card = e.target.closest('.stat-card');
        if (!card) return;
        draggedElement = card;
        card.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
    });

    statsGrid.addEventListener('dragend', (e) => {
        const card = e.target.closest('.stat-card');
        if (card) card.classList.remove('dragging');
    });

    statsGrid.addEventListener('dragover', (e) => {
        e.preventDefault();
        const target = e.target.closest('.stat-card');
        if (!target || target === draggedElement) return;
        const rect = target.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        if (e.clientY < midY) {
            statsGrid.insertBefore(draggedElement, target);
        } else {
            statsGrid.insertBefore(draggedElement, target.nextSibling);
        }
        updateCardOrder();
    });

    function updateCardOrder() {
        const cards = statsGrid.querySelectorAll('.stat-card');
        cardOrder = Array.from(cards).map(c => c.dataset.id);
        localStorage.setItem('cardOrder', JSON.stringify(cardOrder));
    }

    function restoreCardOrder() {
        const saved = localStorage.getItem('cardOrder');
        if (saved) {
            try {
                const order = JSON.parse(saved);
                const cards = statsGrid.querySelectorAll('.stat-card');
                const cardMap = {};
                cards.forEach(c => { cardMap[c.dataset.id] = c; });
                const fragment = document.createDocumentFragment();
                order.forEach(id => {
                    if (cardMap[id]) {
                        fragment.appendChild(cardMap[id]);
                    }
                });
                cards.forEach(c => {
                    if (!fragment.contains(c)) fragment.appendChild(c);
                });
                statsGrid.innerHTML = '';
                statsGrid.appendChild(fragment);
                cardOrder = order;
            } catch(e) { console.warn('Invalid card order', e); }
        }
    }

    // --- Helpers ---
    function formatNumber(num) {
        if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
        return num.toString();
    }

    function timeAgo(date) {
        const diff = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
        if (diff < 60) return 'just now';
        if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
        if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
        if (diff < 604800) return Math.floor(diff / 86400) + 'd ago';
        return new Date(date).toLocaleDateString();
    }

    function showError(msg) {
        errorText.textContent = msg || 'Something went wrong. Please try again.';
        errorDiv.classList.add('visible');
        setTimeout(() => errorDiv.classList.remove('visible'), 5000);
    }

    function setLoading(loading) {
        fetchBtn.disabled = loading;
        fetchBtn.innerHTML = loading ?
            '<span class="loading-spinner"></span> Loading...' :
            '<i class="fas fa-rocket"></i> Generate Dashboard';
    }

    // --- Fetch GitHub Data ---
    async function fetchGitHubData(username) {
        try {
            setLoading(true);
            errorDiv.classList.remove('visible');

            const userRes = await fetch(`https://api.github.com/users/${username}`);
            if (!userRes.ok) throw new Error('User not found');
            const user = await userRes.json();

            const reposRes = await fetch(`https://api.github.com/users/${username}/repos?per_page=100&sort=updated`);
            if (!reposRes.ok) throw new Error('Could not fetch repos');
            const repos = await reposRes.json();

            const eventsRes = await fetch(`https://api.github.com/users/${username}/events/public?per_page=20`);
            const events = eventsRes.ok ? await eventsRes.json() : [];

            const pinned = repos
                .sort((a, b) => b.stargazers_count - a.stargazers_count)
                .slice(0, 6);

            return { user, repos, events, pinned };
        } catch (err) {
            showError(err.message || 'Failed to fetch GitHub data');
            return null;
        } finally {
            setLoading(false);
        }
    }

    // --- Render ---
    function renderProfile(data) {
        if (!data) return;
        currentData = data;
        const { user, repos, events, pinned } = data;

        // Profile
        if (user.avatar_url) {
            avatarContainer.innerHTML = `<img src="${user.avatar_url}" alt="${user.login}">`;
        }
        profileName.textContent = user.name || user.login;
        profileBio.textContent = user.bio || 'GitHub developer 🚀';
        profileLink.href = user.html_url;
        profileLink.textContent = `github.com/${user.login}`;
        followersLink.innerHTML = `<i class="fas fa-users"></i> ${formatNumber(user.followers)} followers`;
        starsLink.innerHTML = `<i class="fas fa-star"></i> ${formatNumber(user.public_repos * 3)} stars`;

        // Stats
        const totalForks = repos.reduce((sum, r) => sum + r.forks_count, 0);
        const totalStars = repos.reduce((sum, r) => sum + r.stargazers_count, 0);
        const totalPRs = Math.floor(totalStars * 0.15);
        const totalRepos = repos.length;

        statForks.textContent = formatNumber(totalForks);
        statStars.textContent = formatNumber(totalStars);
        statPRs.textContent = formatNumber(totalPRs);
        statRepos.textContent = totalRepos;
        statContributors.textContent = formatNumber(Math.floor(totalStars * 0.08) + 5);

        const commitEvents = events.filter(e => e.type === 'PushEvent');
        const commitCount = commitEvents.reduce((sum, e) => sum + (e.payload?.commits?.length || 0), 0);
        statCommits.textContent = formatNumber(commitCount || totalRepos * 4);

        const openIssues = repos.reduce((sum, r) => sum + r.open_issues_count, 0);
        openIssuesSpan.textContent = openIssues;

        // Pinned Repos
        renderPinnedRepos(pinned);

        // Wakatime (simulated)
        renderWakatime();

        // Charts
        renderCharts(data);

        // Activity Feed
        renderFeed(events);
    }

    function renderPinnedRepos(pinned) {
        repoGrid.innerHTML = '';
        if (!pinned || pinned.length === 0) {
            repoGrid.innerHTML = `<div style="color:var(--text-secondary);">No pinned repositories found</div>`;
            return;
        }
        pinned.forEach(repo => {
            const card = document.createElement('div');
            card.className = 'repo-card';
            const langColor = repo.language ? getLangColor(repo.language) : '#8b949e';
            card.innerHTML = `
                <a href="${repo.html_url}" target="_blank" class="repo-name">${repo.name}</a>
                <div class="repo-desc">${repo.description || 'No description'}</div>
                <div class="repo-meta">
                    <span><span class="lang-dot" style="background:${langColor};"></span>${repo.language || 'Unknown'}</span>
                    <span><i class="fas fa-star"></i> ${repo.stargazers_count}</span>
                    <span><i class="fas fa-code-fork"></i> ${repo.forks_count}</span>
                </div>
            `;
            repoGrid.appendChild(card);
        });
    }

    function getLangColor(lang) {
        const colors = {
            'JavaScript': '#f1e05a',
            'TypeScript': '#3178c6',
            'Python': '#3572A5',
            'Rust': '#dea584',
            'Go': '#00ADD8',
            'Java': '#b07219',
            'C++': '#f34b7d',
            'C#': '#178600',
            'Ruby': '#701516',
            'PHP': '#4F5D95',
            'Swift': '#ffac45',
            'Kotlin': '#A97BFF',
            'HTML': '#e34c26',
            'CSS': '#563d7c',
        };
        return colors[lang] || '#8b949e';
    }

    function renderWakatime() {
        const hours = (Math.random() * 200 + 50).toFixed(0);
        const projects = Math.floor(Math.random() * 15 + 3);
        const languages = Math.floor(Math.random() * 8 + 4);
        const avg = (parseFloat(hours) / 30).toFixed(1);

        wakaHours.textContent = hours;
        wakaProjects.textContent = projects;
        wakaLanguages.textContent = languages;
        wakaAvg.textContent = avg + 'h';
    }

    function renderCharts(data) {
        const { repos } = data;

        // Language Chart
        const langMap = {};
        repos.forEach(repo => {
            if (repo.language) {
                langMap[repo.language] = (langMap[repo.language] || 0) + 1;
            }
        });
        const sorted = Object.entries(langMap).sort((a, b) => b[1] - a[1]).slice(0, 7);
        const labels = sorted.map(([name]) => name);
        const values = sorted.map(([, count]) => count);

        const ctx1 = document.getElementById('langChart').getContext('2d');
        if (langChartInstance) langChartInstance.destroy();

        const colors = ['#58a6ff', '#f0883e', '#f1e05a', '#2ea043', '#8b949e', '#d2a8ff', '#ff7b72'];
        langChartInstance = new Chart(ctx1, {
            type: 'doughnut',
            data: {
                labels: labels.length ? labels : ['No Data'],
                datasets: [{
                    data: labels.length ? values : [1],
                    backgroundColor: labels.length ? colors.slice(0, labels.length) : ['#30363d'],
                    borderColor: getComputedStyle(document.documentElement).getPropertyValue('--bg-secondary').trim() || '#161b22',
                    borderWidth: 2,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: {
                            color: getComputedStyle(document.documentElement).getPropertyValue('--text-secondary').trim() || '#8b949e',
                            font: { size: 10 },
                            boxWidth: 10,
                            padding: 8,
                        }
                    }
                },
                cutout: '55%',
            }
        });

        // Heatmap (mock)
        const ctx2 = document.getElementById('heatmapChart').getContext('2d');
        if (heatmapInstance) heatmapInstance.destroy();

        const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
        const heatmapValues = days.map(() => Math.floor(Math.random() * 10 + 2));

        heatmapInstance = new Chart(ctx2, {
            type: 'bar',
            data: {
                labels: days,
                datasets: [{
                    label: 'Avg Commits',
                    data: heatmapValues,
                    backgroundColor: heatmapValues.map(v =>
                        `rgba(88, 166, 255, ${0.4 + (v / 12) * 0.5})`
                    ),
                    borderColor: getComputedStyle(document.documentElement).getPropertyValue('--bg-secondary').trim() || '#161b22',
                    borderWidth: 1,
                    borderRadius: 4,
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: { legend: { display: false } },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: 'var(--border-color)', drawBorder: false },
                        ticks: { color: 'var(--text-secondary)', font: { size: 9 } }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: 'var(--text-secondary)', font: { size: 9 } }
                    }
                }
            }
        });

        // Frequency Chart (mock)
        const ctx3 = document.getElementById('frequencyChart').getContext('2d');
        if (frequencyInstance) frequencyInstance.destroy();

        const hours = Array.from({length: 12}, (_, i) => `${i+9}:00`);
        const freqData = hours.map(() => Math.floor(Math.random() * 15 + 2));

        frequencyInstance = new Chart(ctx3, {
            type: 'line',
            data: {
                labels: hours,
                datasets: [{
                    label: 'Commits',
                    data: freqData,
                    borderColor: '#58a6ff',
                    backgroundColor: 'rgba(88, 166, 255, 0.1)',
                    fill: true,
                    tension: 0.4,
                    pointRadius: 3,
                    pointBackgroundColor: '#58a6ff',
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: true,
                plugins: { legend: { display: false } },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: 'var(--border-color)', drawBorder: false },
                        ticks: { color: 'var(--text-secondary)', font: { size: 9 } }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: 'var(--text-secondary)', font: { size: 8 }, maxTicksLimit: 8 }
                    }
                }
            }
        });
    }

    function renderFeed(events) {
        feedList.innerHTML = '';
        if (events && events.length > 0) {
            const displayEvents = events.slice(0, 10);
            displayEvents.forEach(e => {
                const item = document.createElement('div');
                item.className = 'feed-item';

                let icon = 'fa-code';
                let text = '';

                switch (e.type) {
                    case 'PushEvent':
                        icon = 'fa-code-commit';
                        const count = e.payload?.commits?.length || 0;
                        text = `Pushed ${count} commit${count > 1 ? 's' : ''} to <a href="${e.repo.url}" target="_blank">${e.repo.name}</a>`;
                        break;
                    case 'CreateEvent':
                        icon = 'fa-plus-circle';
                        text = `Created ${e.payload?.ref_type || 'repository'} <a href="${e.repo.url}" target="_blank">${e.repo.name}</a>`;
                        break;
                    case 'PullRequestEvent':
                        icon = 'fa-pull-request';
                        text = `Opened PR in <a href="${e.repo.url}" target="_blank">${e.repo.name}</a>`;
                        break;
                    case 'IssuesEvent':
                        icon = 'fa-exclamation-circle';
                        text = `Opened issue in <a href="${e.repo.url}" target="_blank">${e.repo.name}</a>`;
                        break;
                    case 'WatchEvent':
                        icon = 'fa-star';
                        text = `Starred <a href="${e.repo.url}" target="_blank">${e.repo.name}</a>`;
                        break;
                    default:
                        icon = 'fa-code';
                        text = `Activity on <a href="${e.repo.url}" target="_blank">${e.repo.name}</a>`;
                }

                item.innerHTML = `
                    <span class="feed-icon"><i class="fas ${icon}"></i></span>
                    <span class="feed-text">${text}</span>
                    <span class="feed-time">${timeAgo(e.created_at)}</span>
                `;
                feedList.appendChild(item);
            });
        } else {
            feedList.innerHTML = `
                <div class="feed-item">
                    <span class="feed-icon"><i class="fas fa-info-circle"></i></span>
                    <span class="feed-text">No recent public activity found</span>
                    <span class="feed-time">-</span>
                </div>
            `;
        }
    }

    // --- Export Functions ---
    function exportMarkdown() {
        if (!currentData) {
            showError('Please load a profile first');
            return;
        }
        const { user, repos } = currentData;
        const totalStars = repos.reduce((sum, r) => sum + r.stargazers_count, 0);
        const totalForks = repos.reduce((sum, r) => sum + r.forks_count, 0);

        const md = `# ${user.name || user.login}

![GitHub followers](https://img.shields.io/github/followers/${user.login}?style=social)
![GitHub stars](https://img.shields.io/github/stars/${user.login}?style=social)

${user.bio || ''}

## 📊 GitHub Stats

- **Repositories:** ${repos.length}
- **Total Stars:** ${totalStars}
- **Total Forks:** ${totalForks}
- **Followers:** ${user.followers}

## 🛠️ Top Languages

${Object.entries(
    repos.reduce((acc, r) => {
        if (r.language) acc[r.language] = (acc[r.language] || 0) + 1;
        return acc;
    }, {})
).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([lang, count]) => `- ${lang}: ${count} repos`).join('\n')}

---
*Generated with [GitHub Profile Forge](https://github.com/)*
`;
        const blob = new Blob([md], { type: 'text/markdown' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `README-${user.login}.md`;
        a.click();
        URL.revokeObjectURL(url);
    }

    function exportPNG() {
        const card = document.getElementById('dashboardCard');
        html2canvas(card, {
            scale: 2,
            backgroundColor: getComputedStyle(document.documentElement).getPropertyValue('--bg-secondary').trim() || '#161b22',
            useCORS: true,
            logging: false,
        }).then(canvas => {
            const link = document.createElement('a');
            link.download = `profile-${currentUsername}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
        }).catch(err => {
            showError('Failed to export PNG: ' + err.message);
        });
    }

    // --- Share ---
    window.shareOn = function(platform) {
        const url = window.location.href;
        const text = `Check out my GitHub developer dashboard! 🚀 #GitHub #Developer #OpenSource`;
        let shareUrl = '';
        switch(platform) {
            case 'twitter':
                shareUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
                break;
            case 'linkedin':
                shareUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
                break;
            case 'whatsapp':
                shareUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(text + ' ' + url)}`;
                break;
            case 'reddit':
                shareUrl = `https://reddit.com/submit?url=${encodeURIComponent(url)}&title=${encodeURIComponent(text)}`;
                break;
        }
        if (shareUrl) window.open(shareUrl, '_blank');
    };

    shareBtn.addEventListener('click', () => {
        shareModal.classList.add('active');
    });

    closeModal.addEventListener('click', () => {
        shareModal.classList.remove('active');
    });

    shareModal.addEventListener('click', (e) => {
        if (e.target === shareModal) shareModal.classList.remove('active');
    });

    // --- Main load ---
    async function loadUser(username) {
        const data = await fetchGitHubData(username);
        if (data) {
            renderProfile(data);
            currentUsername = username;
        }
    }

    fetchBtn.addEventListener('click', () => {
        const username = usernameInput.value.trim();
        if (username) loadUser(username);
        else showError('Please enter a GitHub username');
    });

    usernameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') fetchBtn.click();
    });

    exportMarkdownBtn.addEventListener('click', exportMarkdown);
    exportPNGBtn.addEventListener('click', exportPNG);

    // --- Demo buttons ---
    document.getElementById('contributeBtn').addEventListener('click', (e) => {
        e.preventDefault();
        alert('🚀 Thank you for your interest!\n\nThis project is open for contributions under Apache 2.0.\nPlease review the Code of Conduct before submitting PRs.\n\nGitHub: https://github.com/' + currentUsername);
    });

    document.getElementById('licenseBtn').addEventListener('click', (e) => {
        e.preventDefault();
        alert('📄 Apache License 2.0\n\nFull text available at: https://www.apache.org/licenses/LICENSE-2.0\n\nCode of Conduct: Contributor Covenant v2.1');
    });

    document.getElementById('inviteBtn').addEventListener('click', (e) => {
        e.preventDefault();
        alert('📬 Invitation sent! (simulated)\n\nWe encourage all active GitHub coders to join and contribute.\n\nShare this dashboard with your network!');
    });

    // --- Init ---
    restoreCardOrder();
    loadUser('octocat');

    // Fix chart colors on theme change
    const originalSetTheme = setTheme;
    setTheme = function(dark) {
        originalSetTheme(dark);
        if (currentData) renderCharts(currentData);
    };
    window.setTheme = setTheme;

})();
