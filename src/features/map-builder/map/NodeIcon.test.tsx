import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { NodeIcon } from './NodeIcon'
import type { POI } from '../types'

function renderGate(name: string) {
  const poi: POI = {
    id: 'gate-test',
    type: 'gate',
    name,
    keywords: [],
    waypointId: null,
    projectedEdgeId: null,
    projectedT: null,
    linkedPortalIds: [],
    x: 0.5,
    y: 0.5,
    floor: 1,
  }

  return renderToStaticMarkup(
    <NodeIcon
      poi={poi}
      imgWidth={100}
      imgHeight={100}
      selected={false}
      isUnlinked={false}
      onSelect={() => {}}
      onDragStart={() => {}}
    />,
  )
}

describe('NodeIcon gate badge', () => {
  it('renders the gate name on the badge when present', () => {
    const markup = renderGate('8a')

    expect(markup).toContain('class="node-gate-label"')
    expect(markup).toContain('8a')
    expect(markup).not.toContain('<svg')
  })

  it('renders a letter fallback for unnamed gates', () => {
    const markup = renderGate('')

    expect(markup).toContain('class="node-gate-label"')
    expect(markup).toContain('G')
    expect(markup).not.toContain('<svg')
  })
})
