/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DisposableStore } from '../../../../../base/common/lifecycle.js';
import { autorun, IObservable, IReader } from '../../../../../base/common/observable.js';
import { localize } from '../../../../../nls.js';
import { IChatEditingSession, IModifiedFileEntry, ModifiedFileEntryState } from '../../common/chatEditingService.js';
import { DetailedLineRangeMapping } from '../../../../../editor/common/diff/rangeMapping.js';
import { ILabelService } from '../../../../../platform/label/common/label.js';
import { ITextModelService } from '../../../../../editor/common/services/resolverService.js';
import { IEditorWorkerService } from '../../../../../editor/common/services/editorWorker.js';
import { IConfigurationService } from '../../../../../platform/configuration/common/configuration.js';
import { observableConfigValue } from '../../../../../platform/observable/common/platformObservableUtils.js';

export interface IComposerHunk {
	entry: IModifiedFileEntry;
	hunk: DetailedLineRangeMapping;
	enabled: boolean;
}

export class ComposerUnifiedDiffView {
	private readonly _disposables = new DisposableStore();
	private _enabledHunks = new Map<string, boolean>(); // key: entryId + hunk index
	private readonly _ignoreTrimWhitespace: IObservable<boolean>;

	constructor(
		private readonly _container: HTMLElement,
		private readonly _session: IChatEditingSession | undefined,
		private readonly _onHunkToggle: (entry: IModifiedFileEntry, hunk: DetailedLineRangeMapping, enabled: boolean) => void,
		@ILabelService private readonly _labelService: ILabelService,
		@ITextModelService private readonly _textModelService: ITextModelService,
		@IEditorWorkerService private readonly _editorWorkerService: IEditorWorkerService,
		@IConfigurationService private readonly _configurationService: IConfigurationService,
	) {
		this._ignoreTrimWhitespace = observableConfigValue('diffEditor.ignoreTrimWhitespace', true, this._configurationService);
		this._render();
	}

	dispose(): void {
		this._disposables.dispose();
	}

	private _render(): void {
		if (!this._session) {
			this._container.innerHTML = '';
			return;
		}

		// Use autorun to reactively update when entries change
		this._disposables.add(autorun((reader) => {
			const entries = this._session!.entries.read(reader);

			// Clear container
			this._container.innerHTML = '';

			if (entries.length === 0) {
				const emptyMsg = document.createElement('div');
				emptyMsg.className = 'composer-proposals-empty';
				emptyMsg.textContent = localize('composer.noProposals', "No proposals generated yet.");
				this._container.appendChild(emptyMsg);
				return;
			}

			// Render each file entry asynchronously
			// Note: autorun doesn't handle async well, so we fire-and-forget here
			// The rendering will update incrementally
			Promise.all(entries.map(entry => this._renderFileEntry(entry, reader))).catch(err => {
				console.error('Error rendering file entries:', err);
			});
		}));
	}

	private async _renderFileEntry(entry: IModifiedFileEntry, reader: IReader): Promise<void> {
		const fileContainer = document.createElement('div');
		fileContainer.className = 'composer-file-entry';

		const fileHeader = document.createElement('div');
		fileHeader.className = 'composer-file-header';

		const fileName = document.createElement('div');
		fileName.className = 'composer-file-name';
		fileName.textContent = this._labelService.getUriLabel(entry.modifiedURI, { relative: true });
		fileHeader.appendChild(fileName);

		// Progress indicator
		const progressIndicator = document.createElement('span');
		progressIndicator.className = 'composer-file-progress';
		progressIndicator.setAttribute('aria-label', '');
		fileHeader.appendChild(progressIndicator);

		// Update progress indicator based on state
		const updateProgress = () => {
			const state = entry.state.read(reader);
			const isModifying = entry.isCurrentlyBeingModifiedBy.read(reader);

			progressIndicator.className = 'composer-file-progress';
			progressIndicator.setAttribute('aria-label', '');

			if (isModifying) {
				progressIndicator.classList.add('composer-file-progress-generating');
				progressIndicator.setAttribute('aria-label', localize('composer.fileGenerating', "Generating changes..."));
				progressIndicator.textContent = '⟳';
			} else if (state === ModifiedFileEntryState.Modified) {
				progressIndicator.classList.add('composer-file-progress-ready');
				progressIndicator.setAttribute('aria-label', localize('composer.fileReady', "Ready"));
				progressIndicator.textContent = '✓';
			} else if (state === ModifiedFileEntryState.Accepted) {
				progressIndicator.classList.add('composer-file-progress-applied');
				progressIndicator.setAttribute('aria-label', localize('composer.fileApplied', "Applied"));
				progressIndicator.textContent = '✓';
			} else if (state === ModifiedFileEntryState.Rejected) {
				progressIndicator.classList.add('composer-file-progress-rejected');
				progressIndicator.setAttribute('aria-label', localize('composer.fileRejected', "Rejected"));
				progressIndicator.textContent = '✗';
			}
		};

		// Initial update
		updateProgress();

		// Subscribe to state changes
		const stateDisposable = autorun(reader => {
			entry.state.read(reader);
			entry.isCurrentlyBeingModifiedBy.read(reader);
			updateProgress();
		});
		this._disposables.add(stateDisposable);

		const changeCount = entry.changesCount.read(reader);
		const changeCountBadge = document.createElement('span');
		changeCountBadge.className = 'composer-file-change-count';
		changeCountBadge.textContent = `${changeCount} change${changeCount === 1 ? '' : 's'}`;
		fileHeader.appendChild(changeCountBadge);

		fileContainer.appendChild(fileHeader);

		if (changeCount === 0) {
			const noChanges = document.createElement('div');
			noChanges.className = 'composer-file-no-changes';
			noChanges.textContent = localize('composer.noChanges', "No changes");
			fileContainer.appendChild(noChanges);
			this._container.appendChild(fileContainer);
			return;
		}

		// Get diff info - we need to read the models and compute diff
		try {
			const originalRef = await this._textModelService.createModelReference(entry.originalURI);
			const modifiedRef = await this._textModelService.createModelReference(entry.modifiedURI);

			try {
				const ignoreTrimWhitespace = this._ignoreTrimWhitespace.read(reader);
				const diff = await this._editorWorkerService.computeDiff(
					entry.originalURI,
					entry.modifiedURI,
					{ ignoreTrimWhitespace, computeMoves: false, maxComputationTimeMs: 3000 },
					'advanced'
				);

				if (diff && diff.changes.length > 0) {
					const hunksContainer = document.createElement('div');
					hunksContainer.className = 'composer-hunks-container';

					// File-level toggle
					const fileToggle = document.createElement('div');
					fileToggle.className = 'composer-file-toggle';
				const fileCheckbox = document.createElement('input');
				fileCheckbox.type = 'checkbox';
				fileCheckbox.className = 'composer-hunk-checkbox';
				fileCheckbox.id = `file-${entry.entryId}`;
				fileCheckbox.setAttribute('aria-label', localize('composer.selectAllFileAria', "Select all hunks in {0}", fileName.textContent));
				fileCheckbox.setAttribute('role', 'checkbox');

				const allEnabled = diff.changes.every((_, idx) => {
					const key = `${entry.entryId}-${idx}`;
					return this._enabledHunks.get(key) !== false;
				});
				fileCheckbox.checked = allEnabled;
				fileCheckbox.setAttribute('aria-checked', allEnabled ? 'true' : 'false');

				fileCheckbox.addEventListener('change', () => {
					const enabled = fileCheckbox.checked;
					fileCheckbox.setAttribute('aria-checked', enabled ? 'true' : 'false');
					diff.changes.forEach((hunk, idx) => {
						const key = `${entry.entryId}-${idx}`;
						this._enabledHunks.set(key, enabled);
						this._onHunkToggle(entry, hunk, enabled);
					});
					// Update individual checkboxes without full re-render
					diff.changes.forEach((_, idx) => {
						const checkbox = hunksContainer.querySelector(`#hunk-${entry.entryId}-${idx}`) as HTMLInputElement;
						if (checkbox) {
							checkbox.checked = enabled;
							checkbox.setAttribute('aria-checked', enabled ? 'true' : 'false');
						}
					});
				});

					fileToggle.appendChild(fileCheckbox);
					const fileToggleLabel = document.createElement('label');
					fileToggleLabel.textContent = localize('composer.selectAllInFile', "Select all");
					fileToggleLabel.addEventListener('click', () => fileCheckbox.click());
					fileToggle.appendChild(fileToggleLabel);
					hunksContainer.appendChild(fileToggle);

					// Render each hunk
					diff.changes.forEach((hunk, idx) => {
						const hunkEl = this._renderHunk(entry, hunk, idx, reader);
						hunksContainer.appendChild(hunkEl);
					});

					fileContainer.appendChild(hunksContainer);
				}
			} finally {
				originalRef.dispose();
				modifiedRef.dispose();
			}
		} catch (error) {
			const errorMsg = document.createElement('div');
			errorMsg.className = 'composer-file-error';
			errorMsg.textContent = localize('composer.diffError', "Error loading diff: {0}", error);
			fileContainer.appendChild(errorMsg);
		}

		this._container.appendChild(fileContainer);
	}

	private _renderHunk(entry: IModifiedFileEntry, hunk: DetailedLineRangeMapping, idx: number, reader: IReader): HTMLElement {
		const hunkEl = document.createElement('div');
		hunkEl.className = 'composer-hunk';

		const hunkRow = document.createElement('div');
		hunkRow.className = 'composer-hunk-row';

		const checkbox = document.createElement('input');
		checkbox.type = 'checkbox';
		checkbox.className = 'composer-hunk-checkbox';
		checkbox.id = `hunk-${entry.entryId}-${idx}`;
		const key = `${entry.entryId}-${idx}`;
		checkbox.checked = this._enabledHunks.get(key) !== false; // default to true

		const originalLines = hunk.original.isEmpty ? 0 : (hunk.original.endLineNumberExclusive - hunk.original.startLineNumber);
		const modifiedLines = hunk.modified.isEmpty ? 0 : (hunk.modified.endLineNumberExclusive - hunk.modified.startLineNumber);
		const rangeText = hunk.modified.isEmpty
			? localize('composer.hunkDeleted', "Deleted at line {0}", hunk.original.startLineNumber)
			: localize('composer.hunkRange', "Lines {0}-{1}", hunk.modified.startLineNumber, hunk.modified.endLineNumberExclusive - 1);

		checkbox.setAttribute('aria-label', localize('composer.hunkToggleAria', "Toggle hunk: {0}, {1} lines removed, {2} lines added", rangeText, originalLines, modifiedLines));
		checkbox.setAttribute('role', 'checkbox');
		checkbox.setAttribute('aria-checked', checkbox.checked ? 'true' : 'false');

		checkbox.addEventListener('change', () => {
			const enabled = checkbox.checked;
			this._enabledHunks.set(key, enabled);
			checkbox.setAttribute('aria-checked', enabled ? 'true' : 'false');
			this._onHunkToggle(entry, hunk, enabled);
		});

		hunkRow.appendChild(checkbox);

		const hunkInfo = document.createElement('div');
		hunkInfo.className = 'composer-hunk-info';

		hunkInfo.innerHTML = `
			<span class="composer-hunk-range">${rangeText}</span>
			<span class="composer-hunk-stats">
				${originalLines > 0 ? `<span class="composer-hunk-removed">-${originalLines}</span>` : ''}
				${modifiedLines > 0 ? `<span class="composer-hunk-added">+${modifiedLines}</span>` : ''}
			</span>
		`;

		hunkRow.appendChild(hunkInfo);
		hunkEl.appendChild(hunkRow);

		return hunkEl;
	}

	getEnabledHunks(): Map<string, boolean> {
		return new Map(this._enabledHunks);
	}

	setHunkEnabled(entry: IModifiedFileEntry, hunkIndex: number, enabled: boolean): void {
		const key = `${entry.entryId}-${hunkIndex}`;
		this._enabledHunks.set(key, enabled);
		this._render();
	}
}

