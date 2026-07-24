// Drift detector — desired-state reconstruction from the deploy-time snapshot.
//
// Regression guard for the wiring bug where `deployedConfig.sections` was passed
// EMPTY, so every app driftDetect handler (which reads deployedConfig.sections)
// computed an empty desired spec and always reported "no drift". The fix rebuilds
// sections from the frozen history snapshot via snapshotSections + canvasItemsOf.

import { snapshotSections, DriftDetector } from '../drift-detector'
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

describe('detectForCanvasAndFinalize (async on-demand check)', () => {
  function makeDetector(detect: () => Promise<void>) {
    const updateMany = jest.fn().mockResolvedValue({ count: 1 })
    const db = { configurationCanvas: { updateMany } } as unknown as ConstructorParameters<typeof DriftDetector>[0]
    const detector = new DriftDetector(db, (() => null) as unknown as ConstructorParameters<typeof DriftDetector>[1])
    ;(detector as unknown as { detectForCanvas: () => Promise<void> }).detectForCanvas = detect
    return { detector, updateMany }
  }

  it('marks the canvas IDLE + stamps lastDriftCheckAt after a check', async () => {
    const { detector, updateMany } = makeDetector(async () => {})
    await detector.detectForCanvasAndFinalize('cust-1', 'canvas-1')
    expect(updateMany).toHaveBeenCalledTimes(1)
    const arg = updateMany.mock.calls[0][0]
    expect(arg.where).toEqual({ id: 'canvas-1', customerId: 'cust-1' })
    expect(arg.data.driftCheckState).toBe('IDLE')
    expect(arg.data.lastDriftCheckAt instanceof Date).toBe(true)
  })

  it('finalizes state even when detection throws, then rethrows (poll never hangs)', async () => {
    const { detector, updateMany } = makeDetector(async () => {
      throw new Error('boom')
    })
    await expect(detector.detectForCanvasAndFinalize('cust-1', 'canvas-1')).rejects.toThrow('boom')
    expect(updateMany).toHaveBeenCalledTimes(1)
    expect(updateMany.mock.calls[0][0].data.driftCheckState).toBe('IDLE')
  })
})
