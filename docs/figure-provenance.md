# Figure and motion provenance

The production VAT bake uses two CC0 sources: pistachio's **Human Basemeshes** and Quaternius's **Animated Human (2017)**. Source-page snapshots, the original `.blend` inputs, and the Quaternius license are tracked in `assets-src/vat/`; their original archive SHA-256 values are recorded in `assets-src/vat/provenance.json`. CC0 1.0 permits copying, modification, and commercial use without attribution.

The anonymous mannequin, mitten/foot simplification, wheelchair geometry, pose adaptation, fixed-topology remesh, and VAT exporter are project work. Blender 4.5.14 LTS is the required regeneration version. Run the explicit heavy bake with:

```sh
.bmad-loop/tools/Blender-4.5.14.app/Contents/MacOS/Blender --background --factory-startup --disable-autoexec --python assets-src/vat/bake.py
```

Ordinary builds consume the checked-in `public/vat` outputs and never require Blender or ignored directories. The runtime geometry is faceless, neutral, untextured, and uses no skeleton posing.
