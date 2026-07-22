// Drift detector — desired-state reconstruction from the deploy-time snapshot.
//
// Regression guard for the wiring bug where `deployedConfig.sections` was passed
// EMPTY, so every app driftDetect handler (which reads deployedConfig.sections)
// computed an empty desired spec and always reported "no drift". The fix rebuilds
// sections from the frozen history snapshot via snapshotSections + canvasItemsOf.

import { snapshotSections } from '../drift-detector'
import { canvasItemsOf } from '../canvasSnapshot'

describe('snapshotSections', () => {
  it('extracts sections from a serialized-canvas history snapshot', () => {
    const snapshot = {
      id: 'h1',
      version: 3,
      sections: [
        { id: 's1', name: 'Group 1', fields: [{ key: 'name', value: 'Sales-FTE' }] },
      ],
    }
    const sections = snapshotSections(snapshot)
    expect(sections).toHaveLength(1)
    expect(sections![0].name).toBe('Group 1')
  })

  it('returns undefined for a legacy snapshot with no sections', () => {
    expect(snapshotSections({ id: 'h1', version: 1 })).toBeUndefined()
    expect(snapshotSections(null)).toBeUndefined()
    expect(snapshotSections({ sections: 'nope' })).toBeUndefined()
  })

  it('feeds canvasItemsOf so handlers see the deployed desired spec (not empty)', () => {
    const snapshot = {
      sections: [
        {
          id: 's1',
          name: 'Group 1',
          fields: [
            { key: 'name', value: 'Sales-FTE' },
            { key: 'description', value: 'Active FTE' },
          ],
        },
      ],
    }
    const { sections } = canvasItemsOf(snapshotSections(snapshot))
    // The bug: this used to be [] → handlers read an empty desired spec.
    expect(sections).toHaveLength(1)
    expect(sections[0].fields).toEqual({ name: 'Sales-FTE', description: 'Active FTE' })
  })
})
