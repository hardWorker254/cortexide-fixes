/*--------------------------------------------------------------------------------------
 *  Copyright 2025 Glass Devtools, Inc. All rights reserved.
 *  Licensed under the Apache License, Version 2.0. See LICENSE.txt for more information.
 *--------------------------------------------------------------------------------------*/

import { Disposable, MutableDisposable } from '../../../../base/common/lifecycle.js';
import { localize } from '../../../../nls.js';
import { IWorkbenchContribution } from '../../../common/contributions.js';
import { IStatusbarEntry, IStatusbarEntryAccessor, IStatusbarService, StatusbarAlignment } from '../../../services/statusbar/browser/statusbar.js';
import { ICortexideSettingsService } from '../common/cortexideSettingsService.js';
import { metricsCollector } from '../common/metricsCollector.js';
import { registerWorkbenchContribution2, WorkbenchPhase } from '../../../common/contributions.js';
import { IChatThreadService } from './chatThreadService.js';
import { localProviderNames } from '../common/cortexideSettingsTypes.js';
import { ProviderName } from '../common/cortexideSettingsTypes.js';

export class CortexideStatusBarContribution extends Disposable implements IWorkbenchContribution {
	static readonly ID = 'workbench.contrib.cortexideStatusBar';

	private modelEntry: IStatusbarEntryAccessor | undefined;
	private latencyEntry: IStatusbarEntryAccessor | undefined;
	private privacyEntry: IStatusbarEntryAccessor | undefined;
	private readonly updateDisposables = this._register(new MutableDisposable());

	constructor(
		@IStatusbarService private readonly statusbarService: IStatusbarService,
		@ICortexideSettingsService private readonly cortexideSettingsService: ICortexideSettingsService,
		@IChatThreadService private readonly chatThreadService: IChatThreadService,
	) {
		super();
		this.create();
		this.registerListeners();
	}

	private create(): void {
		// Model badge entry
		this.modelEntry = this.statusbarService.addEntry(
			this.getModelEntryProps(),
			'cortexide.model',
			StatusbarAlignment.RIGHT,
			{ location: { id: 'status.editor.mode', priority: 100.2 }, alignment: StatusbarAlignment.RIGHT }
		);

		// Latency pulse entry
		this.latencyEntry = this.statusbarService.addEntry(
			this.getLatencyEntryProps(),
			'cortexide.latency',
			StatusbarAlignment.RIGHT,
			{ location: { id: 'status.editor.mode', priority: 100.3 }, alignment: StatusbarAlignment.RIGHT }
		);

		// Privacy/offline indicator entry
		this.privacyEntry = this.statusbarService.addEntry(
			this.getPrivacyEntryProps(),
			'cortexide.privacy',
			StatusbarAlignment.RIGHT,
			{ location: { id: 'status.editor.mode', priority: 100.4 }, alignment: StatusbarAlignment.RIGHT }
		);
	}

	private registerListeners(): void {
		this.updateDisposables.value = this.cortexideSettingsService.onDidChangeState(() => {
			this.modelEntry?.update(this.getModelEntryProps());
		});

		// Listen to stream state changes to update model entry with activity indicator
		this._register(this.chatThreadService.onDidChangeStreamState(() => {
			this.modelEntry?.update(this.getModelEntryProps());
		}));

		// Update latency every 500ms during active requests
		const latencyUpdateInterval = setInterval(() => {
			this.latencyEntry?.update(this.getLatencyEntryProps());
			this.modelEntry?.update(this.getModelEntryProps());
			this.privacyEntry?.update(this.getPrivacyEntryProps());
		}, 500);

		this._register({ dispose: () => clearInterval(latencyUpdateInterval) });
	}

	private getModelEntryProps(): IStatusbarEntry {
		const settings = this.cortexideSettingsService.state;
		const modelSelection = settings.modelSelectionOfFeature['Chat'];

		// Check if there's any active operation
		const streamState = this.chatThreadService.streamState;
		const currentThreadId = this.chatThreadService.state.currentThreadId;
		const currentStreamState = currentThreadId ? streamState[currentThreadId] : undefined;
		const isRunning = currentStreamState?.isRunning;
		const isActive = isRunning === 'LLM' || isRunning === 'tool' || isRunning === 'preparing';

		// Get status message if preparing
		const statusMessage = isRunning === 'preparing' ? currentStreamState?.llmInfo?.displayContentSoFar : undefined;

		// Check if model is local/offline
		const isLocal = modelSelection && (localProviderNames as readonly ProviderName[]).includes(modelSelection.providerName as ProviderName);
		const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;

		if (!modelSelection || (modelSelection.providerName === 'auto' && modelSelection.modelName === 'auto')) {
			const icon = isActive ? '$(loading~spin)' : '$(code)';
			const text = isActive ? `${icon} Auto` : `${icon} Auto`;
			const tooltipReason = isOffline
				? '\n\nReason: Offline mode - using local model'
				: '\n\nReason: Automatic model selection based on task';
			return {
				name: localize('cortexide.model', "Cortexide Model"),
				text,
				ariaLabel: localize('cortexide.model.auto', "Cortexide Model: Auto{0}", isActive ? ' (Active)' : ''),
				tooltip: statusMessage || (localize('cortexide.model.auto.tooltip', "Model: Auto (automatic selection)") + tooltipReason),
			};
		}

		const modelName = modelSelection.modelName;
		const providerName = modelSelection.providerName;
		const displayName = modelName.length > 15 ? modelName.substring(0, 12) + '...' : modelName;
		const icon = isActive ? '$(loading~spin)' : '$(code)';

		// Build enhanced tooltip with reasoning
		let tooltip = statusMessage || localize('cortexide.model.tooltip', "Model: {0} ({1})", modelName, providerName);

		// Add privacy/offline explanation
		if (isLocal) {
			tooltip += '\n\nPrivacy: Local/offline model - data stays on your device';
		} else if (isOffline) {
			tooltip += '\n\nNote: Currently offline - using cached/fallback model';
		} else {
			tooltip += '\n\nPrivacy: Remote model - data sent to provider';
		}

		// Note: Routing reasoning could be added to metrics in the future
		// to provide more detailed "why this model" explanations

		return {
			name: localize('cortexide.model', "Cortexide Model"),
			text: `${icon} ${displayName}`,
			ariaLabel: localize('cortexide.model.selected', "Cortexide Model: {0} ({1}){2}", modelName, providerName, isActive ? ' (Active)' : ''),
			tooltip,
		};
	}

	private getLatencyEntryProps(): IStatusbarEntry {
		// Get latest metrics from latency audit
		const allMetrics = metricsCollector.getAll();
		if (allMetrics.length === 0) {
			return {
				name: localize('cortexide.latency', "Cortexide Latency"),
				text: '',
				ariaLabel: localize('cortexide.latency.idle', "Cortexide Latency: Idle"),
			};
		}

		// Get the most recent request
		const latest = allMetrics[allMetrics.length - 1];
		const ttfs = latest.ttfs;
		const tts = latest.tts;

		// Determine latency status
		let icon = '$(pulse)';
		let status = 'good';

		if (ttfs > 0 && ttfs < 400) {
			status = 'good';
			icon = '$(pulse)';
		} else if (ttfs >= 400 && ttfs < 1000) {
			status = 'warning';
			icon = '$(warning)';
		} else if (ttfs >= 1000) {
			status = 'slow';
			icon = '$(clock)';
		}

		// Calculate tokens per second if available
		let tokensPerSec = '';
		if (tts > 0 && latest.outputTokens > 0) {
			const tps = Math.round((latest.outputTokens / tts) * 1000);
			tokensPerSec = ` ${tps} tok/s`;
		}

		const ttfsDisplay = ttfs > 0 ? `${Math.round(ttfs)}ms` : '—';
		const text = `${icon} ${ttfsDisplay}${tokensPerSec}`;

		return {
			name: localize('cortexide.latency', "Cortexide Latency"),
			text,
			ariaLabel: localize('cortexide.latency.status', "Cortexide Latency: TTFS {0}, Status: {1}", ttfsDisplay, status),
			tooltip: localize('cortexide.latency.tooltip', "Time to first token: {0}ms\nTime to stream: {1}ms{2}", ttfs, tts, tokensPerSec ? `\nSpeed: ${tokensPerSec}` : ''),
		};
	}

	private getPrivacyEntryProps(): IStatusbarEntry {
		const settings = this.cortexideSettingsService.state;
		const modelSelection = settings.modelSelectionOfFeature['Chat'];

		// Check if offline
		const isOffline = typeof navigator !== 'undefined' && !navigator.onLine;

		// Check if model is local
		const isLocal = modelSelection && (localProviderNames as readonly ProviderName[]).includes(modelSelection.providerName as ProviderName);

		// Only show privacy indicator if local or offline
		if (!isLocal && !isOffline) {
			return {
				name: localize('cortexide.privacy', "Cortexide Privacy"),
				text: '', // Hide when not applicable
				ariaLabel: '',
			};
		}

		// Determine icon and tooltip
		let icon = '$(lock)';
		let tooltip = '';

		if (isOffline && isLocal) {
			icon = '$(lock)';
			tooltip = localize('cortexide.privacy.offline.local', "Privacy: Offline mode with local model\n\nYour data stays on your device and is never sent to remote servers.");
		} else if (isOffline) {
			icon = '$(cloud-offline)';
			tooltip = localize('cortexide.privacy.offline', "Privacy: Currently offline\n\nNo network connection available.");
		} else if (isLocal) {
			icon = '$(lock)';
			tooltip = localize('cortexide.privacy.local', "Privacy: Local model\n\nYour data stays on your device and is never sent to remote servers.\n\nWhy this model: Privacy mode enabled or local model preferred for this task.");
		}

		return {
			name: localize('cortexide.privacy', "Cortexide Privacy"),
			text: icon,
			ariaLabel: localize('cortexide.privacy.aria', "Cortexide Privacy: {0}", isOffline ? 'Offline' : 'Local'),
			tooltip,
		};
	}

	override dispose(): void {
		super.dispose();
		this.modelEntry?.dispose();
		this.latencyEntry?.dispose();
		this.privacyEntry?.dispose();
		this.modelEntry = undefined;
		this.latencyEntry = undefined;
		this.privacyEntry = undefined;
	}
}

// Register the contribution
registerWorkbenchContribution2(CortexideStatusBarContribution.ID, CortexideStatusBarContribution, WorkbenchPhase.AfterRestored);

