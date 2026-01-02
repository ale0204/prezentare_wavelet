# Standard test images

The images the backend serves to the compression, denoising and decomposition
demos. `GET /api/sample-images` lists them with their measured dimensions.

## Kodak Lossless True Color Image Suite

`kodim01.png` through `kodim24.png`, 768x512 or 512x768 RGB. Photographic
content with real texture and hard edges, which is what makes blocking and
ringing artefacts visible at all; a smooth synthetic gradient shows neither.
The default image of the DCT-versus-wavelet comparison is `kodim01`.

Source: <http://r0k.us/graphics/kodak/>

## USC-SIPI classics

`peppers_512.png`, `baboon_512.png`, `house_512.png`, `lake_512.png`.

The `_512` in the names is historical and wrong: all four are 200x200 palette
PNGs, downscaled somewhere upstream. They are kept because they are the images
every signal processing course uses, but they are too small and too smooth to
separate two codecs at the same bitrate, so no demo defaults to them.

Source: <https://sipi.usc.edu/database/>

## Citation

```bibtex
@misc{usc-sipi-database,
  title  = {The USC-SIPI Image Database},
  author = {Signal and Image Processing Institute, University of Southern California},
  url    = {https://sipi.usc.edu/database/}
}

@misc{kodak-dataset,
  title = {Kodak Lossless True Color Image Suite},
  url   = {http://r0k.us/graphics/kodak/}
}
```
