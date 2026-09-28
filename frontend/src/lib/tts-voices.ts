export type TtsVoiceId = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';
export type TtsGender = 'male' | 'female' | 'neutral';

export const TTS_VOICES: { id: TtsVoiceId; label: string; gender: TtsGender }[] = [
  { id: 'alloy', label: 'Alloy', gender: 'neutral' },
  { id: 'echo', label: 'Echo', gender: 'male' },
  { id: 'fable', label: 'Fable', gender: 'neutral' },
  { id: 'onyx', label: 'Onyx', gender: 'male' },
  { id: 'nova', label: 'Nova', gender: 'female' },
  { id: 'shimmer', label: 'Shimmer', gender: 'female' },
];

export const DEFAULT_VOICE_BY_GENDER: Record<TtsGender, TtsVoiceId> = {
  male: 'onyx',
  female: 'nova',
  neutral: 'alloy',
};

export function voicesForGender(gender: TtsGender | '') {
  if (!gender) return TTS_VOICES;
  return TTS_VOICES.filter((v) => v.gender === gender);
}

export function genderForVoice(voice: TtsVoiceId): TtsGender {
  return TTS_VOICES.find((v) => v.id === voice)?.gender ?? 'neutral';
}
