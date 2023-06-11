import {create} from 'zustand';
import {generatePromptingStream} from '../utils/api.js';
import {PromptingResult} from '../types.js';

type PromptingState = {
	status: 'connecting' | 'starting_server' | 'error' | 'generating' | 'none';
	errorMessage?: string;
	generation: PromptingResult | null;
	generations: PromptingResult[];
	prompts: string[];
	addPrompt: (prompt: string) => void;
	generate: () => void;
};

export const usePromptingStore = create<PromptingState>((set, get) => ({
	status: 'none',
	errorMessage: undefined,
	generation: null,
	generations: [],
	prompts: [],
	addPrompt: prompt => {
		set(state => ({
			prompts: [...state.prompts, prompt],
		}));
	},
	generate: () => {
		const generation = {command: '', explanation: ''};
		set({
			status: 'connecting',
			generation,
			generations: [...get().generations, generation],
		});

		generatePromptingStream(
			get().prompts,
			get().generations.slice(0, -1),
			(result, status) => {
				if (status === 'error') {
					set({status: 'error', errorMessage: 'Failed to connect to server'});
				} else if (status === 'starting_server') {
					set({status: 'starting_server'});
				} else if (status === 'connected') {
					set({status: 'generating'});
				} else if (status === 'finished') {
					set({status: 'none'});
					return;
				}


				if (result?.type === 'command' || result?.type === 'explanation') {
					const newGeneration = {...(get().generation as PromptingResult)};

					if (result.type === 'command') {
						newGeneration.command += result.text || '';
					} else {
						newGeneration.explanation += result.text || '';
					}

					set({
						generation: newGeneration,
						generations: [...get().generations.slice(0, -1), newGeneration],
					});
				}
			},
		);
	},
}));
