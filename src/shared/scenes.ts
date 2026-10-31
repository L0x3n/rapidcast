export const SCENES = [
  { id: 'starting', name: 'Starting Soon', headline: 'THE SHOW IS ABOUT TO START', title: 'GET READY.', subtitle: 'Good people. Great moments. One stream.' },
  { id: 'live', name: 'Live', headline: 'THIS IS YOUR MOMENT', title: 'LET’S GO.', subtitle: 'Your game and camera arrive with the streaming engine.' },
  { id: 'brb', name: 'BRB', headline: 'TAKING A QUICK BREATHER', title: 'BE RIGHT BACK.', subtitle: 'Stay close. The next moment is coming.' },
  { id: 'ending', name: 'Ending', headline: 'THANK YOU FOR BEING HERE', title: 'WHAT A SHOW.', subtitle: 'See you on the next one.' }
] as const
export type SceneId = typeof SCENES[number]['id']
export function isSceneId(value: unknown): value is SceneId {
  return SCENES.some(scene => scene.id === value)
}
