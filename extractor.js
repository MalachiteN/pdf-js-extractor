// ==UserScript==
// @name         PDF.js Extractor
// @namespace    http://tampermonkey.net/
// @version      2026-05-29
// @description  Extract PDF binary from local memory directly
// @author       Marisa Malachite
// @match        https://lib.example.edu/web/reader/*
// @grant        none
// ==/UserScript==

(function() {
    'use strict';

    const style = document.createElement('style');
    style.textContent = `
        /* Notification */
        .pdfjs-notify {
            position: fixed;
            right: 20px;
            bottom: 20px;
            transform: translateY(20px);
            padding: 10px 20px;
            border-radius: 6px;
            color: #fff;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            font-size: 14px;
            opacity: 0;
            transition: all 0.3s ease;
            z-index: 2147483647;
            pointer-events: none;
            box-shadow: 0 4px 12px rgba(0,0,0,0.15);
            max-width: 80vw;
            word-break: break-word;
        }
        .pdfjs-notify.show { opacity: 1; transform: translateY(0); }
        .pdfjs-notify.hide { opacity: 0; transform: translateY(20px); }
        .pdfjs-notify-info { background: #2196F3; }
        .pdfjs-notify-success { background: #4CAF50; }
        .pdfjs-notify-error { background: #f44336; }

        /* Container & Button */
        #pdfjs-extractor-container {
            position: fixed;
            bottom: 16px;
            left: 16px;
            z-index: 2147483646;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        }
        #pdfjs-extractor-btn {
            width: 36px;
            height: 36px;
            border-radius: 8px;
            border: 1px solid rgba(0,0,0,0.1);
            background: #fff;
            cursor: pointer;
            font-size: 18px;
            display: flex;
            align-items: center;
            justify-content: center;
            box-shadow: 0 2px 8px rgba(0,0,0,0.1);
            transition: transform 0.1s, background 0.2s;
            padding: 0;
            line-height: 1;
        }
        #pdfjs-extractor-btn:hover { transform: scale(1.05); background: #f5f5f5; }

        /* Panel */
        #pdfjs-extractor-panel {
            position: absolute;
            bottom: 44px;
            left: 0;
            width: 280px;
            background: #fff;
            border-radius: 10px;
            box-shadow: 0 8px 24px rgba(0,0,0,0.15);
            padding: 16px;
            opacity: 0;
            transform: scale(0.95) translateY(10px);
            pointer-events: none;
            transition: all 0.2s ease;
            border: 1px solid rgba(0,0,0,0.08);
            display: flex;
            flex-direction: column;
            gap: 12px;
        }
        #pdfjs-extractor-panel.show {
            opacity: 1;
            transform: scale(1) translateY(0);
            pointer-events: auto;
        }

        /* Inner elements */
        .pdfjs-panel-title {
            font-weight: 600;
            font-size: 15px;
            color: #333;
            padding-bottom: 8px;
            border-bottom: 1px solid #eee;
        }
        .pdfjs-panel-row {
            display: flex;
            align-items: center;
            gap: 8px;
        }
        .pdfjs-panel-row label {
            font-size: 13px;
            color: #555;
            white-space: nowrap;
            flex-shrink: 0;
        }
        #pdfjs-filename {
            flex: 1;
            padding: 6px 8px;
            border: 1px solid #ddd;
            border-radius: 6px;
            font-size: 13px;
            outline: none;
            font-family: inherit;
            resize: none;
            overflow: hidden;
        }
        #pdfjs-filename:focus { border-color: #2196F3; }
        #pdfjs-save-btn {
            width: 100%;
            padding: 8px;
            background: #2196F3;
            color: #fff;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-size: 13px;
            font-weight: 500;
            transition: background 0.2s;
        }
        #pdfjs-save-btn:hover { background: #1976D2; }
    `;
    document.head.appendChild(style);

    function showNotify(message, type = 'info') {
        const div = document.createElement('div');
        div.className = `pdfjs-notify pdfjs-notify-${type}`;
        div.textContent = message;
        document.body.appendChild(div);

        requestAnimationFrame(() => {
            requestAnimationFrame(() => div.classList.add('show'));
        });

        setTimeout(() => {
            div.classList.add('hide');
            setTimeout(() => {
                if (div.parentNode) div.remove();
            }, 300);
        }, 3000);
    }

    // UI
    const container = document.createElement('div');
    container.id = 'pdfjs-extractor-container';

    const btn = document.createElement('button');
    btn.id = 'pdfjs-extractor-btn';
    btn.textContent = '📥';
    btn.title = 'PDF.js Saver';

    const panel = document.createElement('div');
    panel.id = 'pdfjs-extractor-panel';

    const title = document.createElement('div');
    title.className = 'pdfjs-panel-title';
    title.textContent = 'PDF.js Saver';

    const row = document.createElement('div');
    row.className = 'pdfjs-panel-row';

    const label = document.createElement('label');
    label.textContent = 'Filename: ';
    label.htmlFor = 'pdfjs-filename';

    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'pdfjs-filename';
    input.value = 'Extracted.pdf';
    input.spellcheck = false;

    const saveBtn = document.createElement('button');
    saveBtn.id = 'pdfjs-save-btn';
    saveBtn.textContent = 'Save';

    row.appendChild(label);
    row.appendChild(input);

    panel.appendChild(title);
    panel.appendChild(row);
    panel.appendChild(saveBtn);

    container.appendChild(btn);
    container.appendChild(panel);
    document.body.appendChild(container);

    // UI interaction
    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        panel.classList.toggle('show');
    });

    document.addEventListener('click', (e) => {
        if (!container.contains(e.target)) {
            panel.classList.remove('show');
        }
    });

    // saving business logic
    saveBtn.addEventListener('click', async () => {
        const fileName = input.value.trim() || 'Extracted.pdf';

        try {
            const pdfDoc = window.PDFViewerApplication?.pdfDocument;
            if (!pdfDoc) {
                showNotify('pdfDocument Not Found. Please wait for the page fully loaded.', 'error');
                return;
            }

            showNotify('Extracting PDF binary from local memory', 'info');

            const pdfData = await pdfDoc.getData();
            const blob = new Blob([pdfData], { type: 'application/pdf' });

            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = fileName;

            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(a.href);

            showNotify('SUCCESS: invoking browser for file saving', 'success');
        } catch (error) {
            showNotify('FAILED: ' + (error.message || error), 'error');
        }
    });
})();
