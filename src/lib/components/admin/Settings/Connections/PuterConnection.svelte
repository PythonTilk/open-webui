<script lang="ts">
	import { getContext, onMount, createEventDispatcher } from 'svelte';
	import { toast } from 'svelte-sonner';

	import { puterEnabled, puterSignedIn, puterUser, models, settings, config } from '$lib/stores';
	import * as PuterAPI from '$lib/apis/puter';
	import { getModels as _getModels } from '$lib/apis';
	import { updateUserSettings } from '$lib/apis/users';

	import Switch from '$lib/components/common/Switch.svelte';
	import Tooltip from '$lib/components/common/Tooltip.svelte';

	const i18n = getContext('i18n');
	const dispatch = createEventDispatcher();

	interface CustomModel {
		id: string;
		endpoint?: string;
	}

	let loading = false;
	let availableModels: string[] = [];
	let showCustomModels = false;
	let newCustomModelId = '';
	let newCustomModelEndpoint = '';
	let customModels: CustomModel[] = [];
	let editingModelIndex: number | null = null;
	let editingEndpoint = '';

	// Refresh models list globally when Puter state changes
	const refreshGlobalModels = async () => {
		let allModels = await _getModels(
			localStorage.token,
			$config?.features?.enable_direct_connections ? ($settings?.directConnections ?? null) : null
		);

		// Add Puter models if enabled (sign-in will happen when user tries to use them)
		if ($puterEnabled && PuterAPI.isPuterAvailable()) {
			try {
				const puterModels = PuterAPI.getModelsWithCustom(customModels);
				if (Array.isArray(puterModels) && puterModels.length > 0) {
					const formattedPuterModels = puterModels.map((m) => ({
						id: `puter/${m.id || m.name || 'unknown'}`,
						name: `Puter: ${m.name || m.id || 'Unknown Model'}`,
						owned_by: 'puter',
						external: true,
						puter: true
					}));
					allModels = [...allModels, ...formattedPuterModels];
				}
			} catch (error) {
				console.error('Failed to load Puter models:', error);
			}
		}

		models.set(allModels);
	};

	const refreshModels = async () => {
		if (!PuterAPI.isPuterAvailable()) return;

		loading = true;
		try {
			const puterModels = PuterAPI.getModelsWithCustom(customModels);
			availableModels = puterModels.map((m) => m.id || m.name || 'unknown');
		} catch (error) {
			console.error('Failed to load Puter models:', error);
		}
		loading = false;
	};

	const handleSignIn = async () => {
		loading = true;
		try {
			const success = await PuterAPI.signIn();
			if (success) {
				puterSignedIn.set(true);
				const user = await PuterAPI.getUser();
				if (user) {
					puterUser.set({ username: user.username, email: user.email });
				}
				toast.success($i18n.t('Signed in with Puter'));
				await refreshModels();
				// Refresh global models to include Puter models
				await refreshGlobalModels();
			}
		} catch (error) {
			toast.error(`Sign in failed: ${error.message}`);
		}
		loading = false;
	};

	const handleSignOut = async () => {
		loading = true;
		try {
			await PuterAPI.signOut();
			puterSignedIn.set(false);
			puterUser.set(null);
			availableModels = [];
			toast.success($i18n.t('Signed out from Puter'));
			// Refresh global models to remove Puter models
			await refreshGlobalModels();
		} catch (error) {
			toast.error(`Sign out failed: ${error.message}`);
		}
		loading = false;
	};

	const handleToggle = async () => {
		if ($puterEnabled) {
			// Enabling Puter
			if (PuterAPI.isPuterAvailable()) {
				// Check if already signed in
				if (PuterAPI.isSignedIn()) {
					puterSignedIn.set(true);
					const user = await PuterAPI.getUser();
					if (user) {
						puterUser.set({ username: user.username, email: user.email });
					}
					await refreshModels();
					await refreshGlobalModels();
				}
			} else {
				toast.error($i18n.t('Puter SDK not available'));
				puterEnabled.set(false);
				return;
			}
		} else {
			// Disabling Puter
			availableModels = [];
			await refreshGlobalModels();
		}

		// Save to user settings
		await settings.update((s) => ({
			...s,
			puterEnabled: $puterEnabled
		}));
		await updateUserSettings(localStorage.token, { ui: $settings });
		
		dispatch('change', { enabled: $puterEnabled });
	};

	const addCustomModel = async () => {
		const modelId = newCustomModelId.trim();
		if (!modelId) {
			toast.error($i18n.t('Please enter a model ID'));
			return;
		}
		if (customModels.some(m => m.id === modelId)) {
			toast.error($i18n.t('Model already added'));
			return;
		}

		const newModel: CustomModel = {
			id: modelId,
			endpoint: newCustomModelEndpoint.trim() || undefined
		};
		customModels = [...customModels, newModel];
		newCustomModelId = '';
		newCustomModelEndpoint = '';
		await saveCustomModels();
		await refreshModels();
		await refreshGlobalModels();
		toast.success($i18n.t('Custom model added'));
	};

	const removeCustomModel = async (modelId: string) => {
		customModels = customModels.filter(m => m.id !== modelId);
		await saveCustomModels();
		await refreshModels();
		await refreshGlobalModels();
		toast.success($i18n.t('Custom model removed'));
	};

	const startEditEndpoint = (index: number) => {
		editingModelIndex = index;
		editingEndpoint = customModels[index].endpoint || '';
	};

	const saveEndpoint = async (index: number) => {
		customModels[index].endpoint = editingEndpoint.trim() || undefined;
		customModels = [...customModels]; // Trigger reactivity
		editingModelIndex = null;
		editingEndpoint = '';
		await saveCustomModels();
		toast.success($i18n.t('Endpoint updated'));
	};

	const cancelEditEndpoint = () => {
		editingModelIndex = null;
		editingEndpoint = '';
	};

	const saveCustomModels = async () => {
		await settings.update((s) => ({
			...s,
			puterCustomModels: customModels
		}));
		await updateUserSettings(localStorage.token, { ui: $settings });
	};

	onMount(async () => {
		// Load puterEnabled from user settings
		if ($settings?.puterEnabled !== undefined) {
			puterEnabled.set($settings.puterEnabled);
		}

		// Load custom models from user settings
		if ($settings?.puterCustomModels && Array.isArray($settings.puterCustomModels)) {
			// Handle migration from old string[] format to new CustomModel[] format
			customModels = $settings.puterCustomModels.map((m: any) => {
				if (typeof m === 'string') {
					return { id: m };
				}
				return m;
			});
		}

		// Check if already signed in with Puter
		if (PuterAPI.isPuterAvailable() && PuterAPI.isSignedIn()) {
			puterSignedIn.set(true);
			const user = await PuterAPI.getUser();
			if (user) {
				puterUser.set({ username: user.username, email: user.email });
			}
			if ($puterEnabled) {
				await refreshModels();
			}
		}
	});
</script>

<div class="my-2">
	<div class="flex justify-between items-center text-sm mb-2">
		<div class="font-medium">
			{$i18n.t('Puter.js')}
			<span class="text-xs text-gray-500 dark:text-gray-400 ml-1">
				({$i18n.t('Free AI Models')})
			</span>
		</div>

		<div class="flex items-center">
			<Switch
				bind:state={$puterEnabled}
				on:change={handleToggle}
			/>
		</div>
	</div>

	{#if $puterEnabled}
		<div class="space-y-3">
			<!-- Status & Auth -->
			<div class="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-850 rounded-lg">
				<div class="flex items-center gap-2">
					{#if $puterSignedIn && $puterUser}
						<div class="w-2 h-2 bg-green-500 rounded-full"></div>
						<span class="text-sm">
							{$i18n.t('Signed in as')} <strong>{$puterUser.username}</strong>
						</span>
					{:else}
						<div class="w-2 h-2 bg-yellow-500 rounded-full"></div>
						<span class="text-sm text-gray-600 dark:text-gray-400">
							{$i18n.t('Not signed in')}
						</span>
					{/if}
				</div>

				<div>
					{#if $puterSignedIn}
						<button
							class="px-3 py-1 text-xs bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 rounded-lg transition"
							on:click={handleSignOut}
							disabled={loading}
						>
							{loading ? $i18n.t('...') : $i18n.t('Sign Out')}
						</button>
					{:else}
						<button
							class="px-3 py-1 text-xs bg-blue-500 hover:bg-blue-600 text-white rounded-lg transition"
							on:click={handleSignIn}
							disabled={loading}
						>
							{loading ? $i18n.t('...') : $i18n.t('Sign In with Puter')}
						</button>
					{/if}
				</div>
			</div>

			<!-- Info -->
			<div class="text-xs text-gray-500 dark:text-gray-400 space-y-1">
				<p>
					{$i18n.t('Puter.js provides free access to AI models. Sign in with your Puter account to use GPT-4o, Claude, Gemini, and more - all for free!')}
				</p>
			</div>

			<!-- Curated Models -->
			{#if availableModels.length > 0}
				<div>
					<div class="text-xs font-medium mb-1">{$i18n.t('Available Models')} ({availableModels.length})</div>
					<div class="flex flex-wrap gap-1">
						{#each availableModels.slice(0, 10) as model}
							<span class="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-800 rounded">
								{model}
							</span>
						{/each}
						{#if availableModels.length > 10}
							<Tooltip content={availableModels.slice(10).join(', ')}>
								<span class="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-800 rounded cursor-help">
									+{availableModels.length - 10} more
								</span>
							</Tooltip>
						{/if}
					</div>
				</div>
			{/if}

			<!-- Custom Models Section -->
			<div class="border-t border-gray-200 dark:border-gray-700 pt-3">
				<button 
					class="text-xs font-medium text-blue-500 hover:text-blue-600 flex items-center gap-1"
					on:click={() => showCustomModels = !showCustomModels}
				>
					<svg 
						class="w-3 h-3 transition-transform {showCustomModels ? 'rotate-90' : ''}" 
						fill="none" 
						stroke="currentColor" 
						viewBox="0 0 24 24"
					>
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7" />
					</svg>
					{$i18n.t('Custom Models')} ({customModels.length})
				</button>

				{#if showCustomModels}
					<div class="mt-2 space-y-3">
						<div class="text-xs text-gray-500 dark:text-gray-400">
							{$i18n.t('Add custom model IDs. For OpenRouter models, use format: openrouter:provider/model-name')}
							<br />
							<a 
								href="https://openrouter.ai/models" 
								target="_blank" 
								rel="noopener noreferrer"
								class="text-blue-500 hover:text-blue-600 underline"
							>
								{$i18n.t('Browse OpenRouter models')} &rarr;
							</a>
						</div>

						<!-- Add new custom model -->
						<div class="space-y-2 p-3 bg-gray-50 dark:bg-gray-850 rounded-lg">
							<div class="text-xs font-medium">{$i18n.t('Add Custom Model')}</div>
							<div class="flex gap-2">
								<input
									type="text"
									class="flex-1 px-2 py-1.5 text-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded"
									placeholder="Model ID (e.g., openrouter:meta-llama/llama-3.1-8b-instruct)"
									bind:value={newCustomModelId}
								/>
							</div>
							<div class="flex gap-2">
								<input
									type="text"
									class="flex-1 px-2 py-1.5 text-xs bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded"
									placeholder="Custom OpenRouter endpoint (optional, leave empty for default)"
									bind:value={newCustomModelEndpoint}
								/>
							</div>
							<button
								class="w-full px-2 py-1.5 text-xs bg-blue-500 hover:bg-blue-600 text-white rounded transition"
								on:click={addCustomModel}
							>
								{$i18n.t('Add Model')}
							</button>
						</div>

						<!-- List of custom models -->
						{#if customModels.length > 0}
							<div class="space-y-2">
								<div class="text-xs font-medium">{$i18n.t('Your Custom Models')}</div>
								{#each customModels as model, index}
									<div class="p-2 bg-gray-100 dark:bg-gray-800 rounded-lg">
										<div class="flex items-center justify-between mb-1">
											<span class="text-xs font-mono font-medium">{model.id}</span>
											<button
												class="text-red-500 hover:text-red-600 p-1"
												on:click={() => removeCustomModel(model.id)}
												title={$i18n.t('Remove model')}
											>
												<svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
													<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
												</svg>
											</button>
										</div>
										
										{#if editingModelIndex === index}
											<!-- Editing endpoint -->
											<div class="flex gap-1 mt-1">
												<input
													type="text"
													class="flex-1 px-2 py-1 text-xs bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded"
													placeholder="https://openrouter.ai/api/v1"
													bind:value={editingEndpoint}
													on:keydown={(e) => {
														if (e.key === 'Enter') saveEndpoint(index);
														if (e.key === 'Escape') cancelEditEndpoint();
													}}
												/>
												<button
													class="px-2 py-1 text-xs bg-green-500 hover:bg-green-600 text-white rounded"
													on:click={() => saveEndpoint(index)}
												>
													{$i18n.t('Save')}
												</button>
												<button
													class="px-2 py-1 text-xs bg-gray-300 hover:bg-gray-400 dark:bg-gray-600 dark:hover:bg-gray-500 rounded"
													on:click={cancelEditEndpoint}
												>
													{$i18n.t('Cancel')}
												</button>
											</div>
										{:else}
											<!-- Display endpoint -->
											<div class="flex items-center gap-1 mt-1">
												<span class="text-xs text-gray-500 dark:text-gray-400">
													{$i18n.t('Endpoint:')}
												</span>
												<span class="text-xs font-mono text-gray-600 dark:text-gray-300 flex-1 truncate">
													{model.endpoint || $i18n.t('(default)')}
												</span>
												<button
													class="text-blue-500 hover:text-blue-600 text-xs px-1"
													on:click={() => startEditEndpoint(index)}
												>
													{$i18n.t('Edit')}
												</button>
											</div>
										{/if}
									</div>
								{/each}
							</div>
						{:else}
							<div class="text-xs text-gray-400 italic">
								{$i18n.t('No custom models added')}
							</div>
						{/if}

						<!-- Example models -->
						<div class="text-xs text-gray-400 dark:text-gray-500 p-2 bg-gray-50 dark:bg-gray-850 rounded">
							<div class="font-medium mb-1">{$i18n.t('Example OpenRouter models:')}</div>
							<ul class="list-disc list-inside space-y-0.5 pl-1 font-mono">
								<li>openrouter:meta-llama/llama-3.1-8b-instruct</li>
								<li>openrouter:google/gemma-2-9b-it</li>
								<li>openrouter:qwen/qwen-2.5-72b-instruct</li>
							</ul>
							<div class="mt-2 text-gray-500">
								{$i18n.t('Find more models at')} 
								<a 
									href="https://openrouter.ai/models" 
									target="_blank" 
									rel="noopener noreferrer"
									class="text-blue-500 hover:text-blue-600 underline"
								>
									openrouter.ai/models
								</a>
							</div>
						</div>
					</div>
				{/if}
			</div>

			<!-- Refresh button -->
			{#if $puterSignedIn}
				<button
					class="text-xs text-blue-500 hover:text-blue-600 dark:text-blue-400"
					on:click={async () => {
						await refreshModels();
						await refreshGlobalModels();
					}}
					disabled={loading}
				>
					{loading ? $i18n.t('Loading...') : $i18n.t('Refresh model list')}
				</button>
			{/if}
		</div>
	{:else}
		<div class="text-xs text-gray-400 dark:text-gray-500">
			{$i18n.t('Enable Puter.js to access free AI models directly from your browser.')}
		</div>
	{/if}
</div>
