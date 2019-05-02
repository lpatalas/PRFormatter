// ==UserScript==
// @name         BitbucketPrFormatter
// @namespace    http://lukaszpatalas.pl/
// @version      1.1
// @description  Bitbucket PR commit message formatter
// @author       Łukasz Patalas
// @match        https://bitbucket.org/*/pull-requests/*
// @grant        none
// ==/UserScript==

interface PullRequest {
    id: number;
    title: string;
    description: string;
}

(function () {
    'use strict';

    const pathRegex = /\/pull-requests\/\d+(\/.+)?$/;
    if (!pathRegex.test(window.location.pathname)) {
        console.log('PRFormatter will not be enabled because URL does not match pattern');
        return;
    }

    console.log("Enablng PRFormatter");

    const mergeButton = document.getElementById('fulfill-pullrequest');
    if (!mergeButton) {
        reportError('Cannot find button by id "fulfill-pullrequest"');
        return;
    }

    mergeButton.addEventListener('click', () => {
        waitForElement('bb-fulfill-pullrequest-dialog', onMergeDialogShown);
    })

    function onMergeDialogShown(dialog: HTMLElement) {
        try {
            const prUrl = getPullRequestApiUrl();
            apiGet(prUrl).then(pullRequest => {
                waitForElement<HTMLTextAreaElement>('id_commit_message', textArea => {
                    fillCommitMessage(dialog, textArea, pullRequest);
                });
            }).catch(reportError);
        }
        catch (error) {
            reportError(error);
        }
    }

    function fillCommitMessage(dialog: HTMLElement, commitMessageTextArea: HTMLTextAreaElement, pullRequest: PullRequest) {
        adjustTextAreaStyles(dialog, commitMessageTextArea);

        const parsedDescription = parseDescription(pullRequest.description);
        console.debug('Parsed description:', parsedDescription);

        var approvedByTrailers = extractApprovedByTrailers(commitMessageTextArea.value);
        console.debug('approvedByTrailers', approvedByTrailers);

        const lines = [ pullRequest.title ];

        if (parsedDescription.text) {
            lines.push('', parsedDescription.text);
        }

        lines.push(
            '',
            ...parsedDescription.trailers,
            `PR: ${pullRequest.id}`,
            ...approvedByTrailers);

        commitMessageTextArea.value = concatLines(lines);
    }

    function adjustTextAreaStyles(dialog: HTMLElement, textArea: HTMLTextAreaElement) {
        dialog.style.width = '1000px';
        textArea.style.fontFamily = 'monospace';
        textArea.style.minHeight = '400px';
        textArea.style.minWidth = '100%';

        addGuideline(textArea, 50, '#8886', 'CommitSubjectGuideline');
        addGuideline(textArea, 72, '#f008', 'CommitBodyGuideline');
    }

    function addGuideline(textArea: HTMLElement, characterOffset: number, color: string, id: string) {
        const textAreaStyle = window.getComputedStyle(textArea);

        const glyphWidth = measureGlyphWidth(textAreaStyle);
        const guidelineOffset = Math.floor(glyphWidth * characterOffset);

        const guidelineDiv = getOrCreateDiv(id);
        guidelineDiv.style.borderRight = `dashed 1px ${color}`;
        guidelineDiv.style.bottom = '0';
        guidelineDiv.style.marginLeft = textAreaStyle.paddingLeft;
        guidelineDiv.style.pointerEvents = 'none';
        guidelineDiv.style.position = 'absolute';
        guidelineDiv.style.top = '0';
        guidelineDiv.style.width = `${guidelineOffset}px`;

        const textAreaParent = textArea.parentElement;
        if (textAreaParent) {
            textAreaParent.appendChild(guidelineDiv);
        }
    }

    function getOrCreateDiv(id: string) {
        const div = document.getElementById(id) || document.createElement('div');
        div.id = id;
        return div;
    }

    function measureGlyphWidth(style: CSSStyleDeclaration) {
        const font = `${style.fontSize} ${style.fontFamily}`;

        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d')!;
        context.font = font;
        console.log(`Measuring text for font ${context.font} (desired: ${font})`);
        const width = context.measureText(' ').width;
        console.log(`Measured width: ${width}`);
        return width;
    }

    const emptyLineRegex = /^\w*$/;
    const trailerRegex = /^[A-Z_-]+: .+$/i;

    function parseDescription(text: string) {
        const lines = text.split('\r\n');
        const trailers = [];
        let descriptionLineCount = lines.length;

        for (let i = lines.length - 1; i >= 0; i--) {
            const line = lines[i];

            if (trailerRegex.test(line)) {
                console.debug('Trailer', line);
                trailers.push(line);
                descriptionLineCount--;
            }
            else if (emptyLineRegex.test(line)) {
                console.debug('Empty', line);
                descriptionLineCount--;
            }
            else {
                console.debug('Break', line);
                break;
            }
        }

        return {
            text: concatLines(lines.slice(0, descriptionLineCount)),
            trailers: trailers
        };
    }

    const approvedByRegex = /^Approved-by: .+$/gm;

    function extractApprovedByTrailers(text: string): string[] {
        return text.match(approvedByRegex) || [];
    }

    function concatLines(lines: readonly string[]) {
        return lines.join('\r\n');
    }

    const pageUrlRegex = /\/(.+)\/pull-requests\/(\d+)/;

    function getPullRequestApiUrl() {
        const pageUrl = document.location.pathname;
        const matches = pageUrlRegex.exec(pageUrl);
        if (!matches) {
            throw new Error(`Cannot match repo and PR id from pathname "${pageUrl}"`);
        }

        const apiBaseUrl = 'https://api.bitbucket.org/2.0'
        const repoSlug = matches[1];
        const prId = matches[2];

        return `${apiBaseUrl}/repositories/${repoSlug}/pullrequests/${prId}`;
    }

    function apiGet(url: string) {
        const apiToken = getApiToken();
        console.debug('apiGet', { url, apiToken });

        const fetchPromise = fetch(url, {
            headers: {
                'Accept': 'application/json',
                'Authorization': `Bearer ${apiToken}`
            }
        });

        return fetchPromise
            .then(function(response) {
                if (response.status === 200) {
                    return response.json();
                }
                else if (response.status === 401) {
                    return Promise.reject(
                        'BitBucket API token expired.'
                        + ' You can fill message manually'
                        + ' or hard-refresh page (Ctrl+F5) and try again.');
                }
                else {
                    return Promise.reject(`BitBucket API returned status: ${response.status} ${response.statusText}`);
                }
            })
            .then(function(pullRequestData) {
                console.debug('PullRequest:', pullRequestData);
                return pullRequestData;
            });
    }

    function getApiToken(): string {
        const meta = document.querySelector('meta[name="apitoken"]') as HTMLMetaElement;
        if (!meta) {
            throw new Error('Cannot find <meta name="apitoken"> element');
        }

        const tokenContent = JSON.parse(meta.content);
        return tokenContent.token;
    }

    const MAX_WAIT_ATTEMPTS = 10;

    function waitForElement<T extends HTMLElement>(elementId: string, callback: (element: T) => void, attempt?: number) {
        attempt = attempt || 0;

        const element = document.getElementById(elementId) as T;
        if (element) {
            callback(element);
        }
        else if (attempt && attempt >= MAX_WAIT_ATTEMPTS) {
            throw new Error(`Maximum number of attempts reached when waiting for element "${elementId}"`);
        }
        else {
            const nextAttempt = (attempt || 0) + 1;

            console.debug(`Element "${elementId}" not found. Attempt ${nextAttempt}/${MAX_WAIT_ATTEMPTS}`);

            setTimeout(() => {
                waitForElement(elementId, callback, nextAttempt);
            }, 100);
        }
    }

    function reportError(error: any) {
        console.error(error);
        const message = error instanceof Error ? error.message : error;
        showToast(`PRFormatter error: ${message}`)
    }

    function showToast(message: string) {
        const container = document.createElement('div');
        container.style.background = 'red';
        container.style.color = 'white';
        container.style.fontWeight = 'bold';
        container.style.height = '20pt';
        container.style.left = '0';
        container.style.position = 'fixed';
        container.style.right = '0';
        container.style.textAlign = 'center';
        container.style.top = '0';
        container.style.verticalAlign = 'center';
        container.style.zIndex = '10000';

        const text = document.createElement('span');
        text.innerText = message;

        const closeButton = document.createElement('a');
        closeButton.style.color = 'white';
        closeButton.style.cursor = 'pointer';
        closeButton.style.height = '20pt';
        closeButton.style.position = 'absolute';
        closeButton.style.right = '0';
        closeButton.style.top = '0';
        closeButton.style.width = '20pt';
        closeButton.innerHTML = 'X';
        closeButton.addEventListener('click', e => {
            document.body.removeChild(container);
            e.preventDefault();
            return true;
        });

        container.appendChild(text);
        container.appendChild(closeButton);
        document.body.appendChild(container);
    }
})();
