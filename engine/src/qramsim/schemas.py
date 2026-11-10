"""JSON Schemas of ``qramsim.run/1`` and ``qramsim.traj/1`` (served at ``/api/schema``).

They document the formats for external tools; the engine itself validates with
:meth:`RunConfig.validate` and :func:`qramsim.trajectory.validate`.
"""

from __future__ import annotations

from typing import Any

from .config import VARIANTS

_AMP = {"type": "array", "items": {"type": "number"}, "minItems": 2, "maxItems": 2}
_POS = {
    "type": "array",
    "items": {"type": "integer"},
    "minItems": 3,
    "maxItems": 4,
    "description": "[level, branch, site] (+ tree); level 0 = port line, site ≤ 0",
}

RUN_JSON_SCHEMA: dict[str, Any] = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "qramsim.run/1",
    "title": "qramsim run configuration",
    "type": "object",
    "properties": {
        "schema": {"const": "qramsim.run/1"},
        "variant": {"enum": list(VARIANTS)},
        "n": {"type": "integer", "minimum": 1},
        "m": {"type": "integer", "minimum": 1},
        "copy_mode": {"enum": ["global", "cell_switch", "backup"]},
        "options": {
            "type": "object",
            "properties": {
                "include_last_backup": {"type": "boolean"},
                "query_stagger": {"type": "boolean"},
                "query": {"type": "boolean"},
                "inverse_mode": {"enum": ["time_reversal"]},
                "n_sites": {"type": "object", "additionalProperties": {"type": "integer"}},
                "strict": {"type": "boolean"},
            },
        },
        "input": {
            "type": "object",
            "properties": {
                "terms": {
                    "type": "array",
                    "minItems": 1,
                    "items": {
                        "type": "object",
                        "properties": {
                            "address": {"type": "string", "pattern": "^[01]+$"},
                            "amp": _AMP,
                        },
                        "required": ["address"],
                    },
                }
            },
            "required": ["terms"],
        },
        "memory": {
            "oneOf": [
                {
                    "type": "object",
                    "properties": {
                        "bits": {
                            "type": "array",
                            "items": {"type": "array", "items": {"enum": [0, 1]}},
                        }
                    },
                    "required": ["bits"],
                },
                {
                    "type": "object",
                    "properties": {
                        "fill": {"enum": ["zeros", "ones", "random", "identity"]},
                        "seed": {"type": ["integer", "null"]},
                    },
                    "required": ["fill"],
                },
            ]
        },
        "noise": {"type": "array", "maxItems": 0},
        "seed": {"type": "integer"},
        "record": {
            "type": "object",
            "properties": {
                "frames": {"type": "boolean"},
                "ghosts": {"type": "boolean"},
                "frame_metrics": {"type": "boolean"},
            },
        },
    },
    "required": ["n", "m", "input"],
}

_WALKER = {
    "type": "object",
    "properties": {
        "k": {"type": "integer"},
        "s": {"type": "string"},
        "pos": _POS,
        "dir": {"enum": [-1, 1]},
        "ghost": {
            "type": "object",
            "properties": {"c": {"type": "string"}, "pos": _POS, "dir": {"enum": [-1, 1]}},
        },
    },
    "required": ["k", "s"],
}
_BRANCH = {
    "type": "object",
    "properties": {
        "id": {"type": "integer"},
        "amp": _AMP,
        "walkers": {"type": "array", "items": _WALKER},
        "cells": {"type": "object", "properties": {"on": {"type": "array"}}},
    },
    "required": ["id", "amp", "walkers"],
}

TRAJ_JSON_SCHEMA: dict[str, Any] = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "qramsim.traj/1",
    "title": "qramsim trajectory",
    "type": "object",
    "properties": {
        "schema": {"type": "string", "pattern": "^qramsim\\.traj/1"},
        "config": {"$ref": "qramsim.run/1"},
        "meta": {
            "type": "object",
            "required": ["variant", "n", "m", "K", "slots", "geometry", "phases", "gates"],
        },
        "frames": {
            "type": "array",
            "items": {
                "type": "object",
                "properties": {
                    "t": {"type": "integer", "minimum": -1},
                    "phase": {"enum": ["init", "routing", "query", "inverse"]},
                    "branches": {"type": "array", "items": _BRANCH},
                    "events": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {"kind": {"type": "string"}, "text": {"type": "string"}},
                            "required": ["kind", "text"],
                        },
                    },
                },
                "required": ["t", "phase", "branches", "events"],
            },
        },
        "final": {"type": "object", "required": ["state", "metrics", "resources"]},
    },
    "required": ["schema", "config", "meta", "frames", "final"],
}
