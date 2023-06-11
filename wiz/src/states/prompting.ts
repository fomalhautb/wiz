import {create} from 'zustand';
import {generatePromptingStream} from '../utils/api.js';
import {PromptingResult} from '../types.js';

type PromptingState = {
	isLoading: boolean;
	isError: boolean;
	error: string;
	generation: PromptingResult | null;
	generations: PromptingResult[];
	prompts: string[];
	addPrompt: (prompt: string) => void;
	generate: () => void;
};

export const usePromptingStore = create<PromptingState>((set, get) => ({
	isLoading: false,
	isError: false,
	error: '',
	generation: null,
	generations: [],
	prompts: [],
	addPrompt: prompt => {
		set(state => ({
			prompts: [...state.prompts, prompt],
		}));
	},
	generate: () => {
		const generation = {command: '', explaination: ''};
		set({
			isLoading: true,
			isError: false,
			error: '',
			generation,
			generations: [...get().generations, generation],
		});

		generatePromptingStream(
			get().prompts,
			get().generations.slice(0, -1),
			result => {
				if (result?.type === 'command' || result?.type === 'explanation') {
					const newGeneration = {...(get().generation as PromptingResult)};

					if (result.type === 'command') {
						newGeneration.command += result.text || '';
					} else {
						newGeneration.explaination += result.text || '';
					}

					set({
						isLoading: true,
						generation: newGeneration,
						generations: [...get().generations.slice(0, -1), newGeneration],
					});
				}
			},
		);
	},
}));
