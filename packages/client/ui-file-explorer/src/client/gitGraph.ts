/**
 * Commit-graph layout for the Git Graph viewer. It assigns each topological
 * commit to a lane (column) and derives the parent edges, using the lane model
 * of `gitk`/`gitio`: a lane slot records the commit it is waiting for plus a
 * branch color, the first parent keeps the current lane, merge points collapse
 * the waiting lanes into the leftmost one, a first parent found on a left lane
 * keeps this node on its own lane (the edge pass then draws a `join`), one
 * found on a right lane migrates the mainline back left, and a second parent
 * already waited for reuses that lane instead of opening a new one. Trailing
 * free lanes are trimmed so the graph never leaks columns.
 */

import type { GitLogCommit } from '@deepseek-ai/dsh-file-explorer/types'

/** Number of distinct branch colors (cycled across new branches). */
export const BRANCH_COLORS = 10

/** A commit placed on the graph grid. */
export interface GraphCommit extends GitLogCommit {
  /** Lane (column) index; the leftmost lane is 0. */
  lane: number
  /** Row index in topological order; the newest commit is row 0. */
  row: number
  /** Branch color index (cycles {@link BRANCH_COLORS}). */
  color: number
}

/** One parent edge from a child node down to a parent node. */
export interface GraphEdge {
  fromLane: number
  fromRow: number
  toLane: number
  toRow: number
  color: number
  /** Whether this edge is the child's first-parent link (mainline continuation or a `join`), versus a merge `out` to a side branch. */
  isFirstParent: boolean
}

/** Complete layout ready for rendering. */
export interface GitGraphLayout {
  commits: GraphCommit[]
  laneCount: number
  edges: GraphEdge[]
}

/** One lane slot: the commit a lane is waiting for, and its branch color. */
interface LaneSlot {
  expecting: string
  color: number
}

/**
 * Assign lanes and derive edges for a topological commit list.
 * @param commits - commits in topological order (every child before its parents).
 * @returns the layout; `laneCount` is at least 1 when any commit exists.
 */
export function buildGitGraph(commits: readonly GitLogCommit[]): GitGraphLayout {
  const lanes: Array<LaneSlot | null> = []
  const placed = new Map<string, GraphCommit>()
  let colorCounter = 0

  const layout: GraphCommit[] = commits.map((commit, row) => {
    // Step A: pick the node's lane. Waiting lanes flow into this commit; the
    // leftmost becomes the node lane and the rest collapse into it.
    const waiting: number[] = []
    for (let i = 0; i < lanes.length; i += 1) {
      if (lanes[i]?.expecting === commit.hash) waiting.push(i)
    }
    let nodeLane: number
    let color: number
    if (waiting.length > 0) {
      nodeLane = waiting[0] as number
      color = (lanes[nodeLane] as LaneSlot).color
      for (const lane of waiting.slice(1)) lanes[lane] = null
    } else {
      nodeLane = lanes.findIndex(slot => slot === null)
      if (nodeLane === -1) {
        nodeLane = lanes.length
        lanes.push(null)
      }
      color = colorCounter % BRANCH_COLORS
      colorCounter += 1
    }
    lanes[nodeLane] = null

    // Step B: the first parent continues the mainline.
    const firstParent = commit.parents[0]
    if (firstParent !== undefined) {
      let parentLane = -1
      for (let i = 0; i < lanes.length; i += 1) {
        if (lanes[i]?.expecting === firstParent) {
          parentLane = i
          break
        }
      }
      if (parentLane === -1 || parentLane === nodeLane) {
        lanes[nodeLane] = { expecting: firstParent, color }
      } else if (parentLane < nodeLane) {
        // The first parent is already on a left lane: this commit is a sub-branch
        // tip, so it leaves the node lane free and joins that lane (rendered as
        // the `join` elbow by the edge pass below).
      } else {
        // The first parent drifted to a right lane: migrate it back left.
        lanes[parentLane] = null
        lanes[nodeLane] = { expecting: firstParent, color }
      }
    }

    // Step C: additional parents are branch relationships. Reuse a lane already
    // waiting for that parent; otherwise open the leftmost free lane.
    for (const parent of commit.parents.slice(1)) {
      let existing = -1
      for (let i = 0; i < lanes.length; i += 1) {
        if (lanes[i]?.expecting === parent) {
          existing = i
          break
        }
      }
      if (existing !== -1) continue
      let free = -1
      for (let i = 0; i < lanes.length; i += 1) {
        if (lanes[i] === null && i !== nodeLane) {
          free = i
          break
        }
      }
      if (free === -1) {
        free = lanes.length
        lanes.push(null)
      }
      const branchColor = colorCounter % BRANCH_COLORS
      colorCounter += 1
      lanes[free] = { expecting: parent, color: branchColor }
    }

    // Step D: trim trailing free lanes so the graph never leaks columns.
    while (lanes.length > 0 && lanes[lanes.length - 1] === null) lanes.pop()

    const graphCommit: GraphCommit = { ...commit, lane: nodeLane, row, color }
    placed.set(commit.hash, graphCommit)
    return graphCommit
  })

  const edges: GraphEdge[] = []
  for (const commit of layout) {
    for (let i = 0; i < commit.parents.length; i += 1) {
      const parent = placed.get(commit.parents[i] as string)
      if (parent === undefined) continue
      edges.push({
        fromLane: commit.lane,
        fromRow: commit.row,
        toLane: parent.lane,
        toRow: parent.row,
        color: i === 0 ? commit.color : parent.color,
        isFirstParent: i === 0,
      })
    }
  }

  let laneCount = 1
  for (const commit of layout) laneCount = Math.max(laneCount, commit.lane + 1)
  for (const edge of edges) laneCount = Math.max(laneCount, edge.fromLane + 1, edge.toLane + 1)

  return { commits: layout, laneCount, edges }
}
