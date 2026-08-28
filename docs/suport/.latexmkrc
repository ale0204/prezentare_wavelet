# Keep the build litter out of the source directory: .aux, .log, .toc, .lof and the rest
# land in _build/, while suport.pdf stays here next to suport.tex because the PDF is the
# deliverable and is committed. _build/ is the only thing .gitignore has to know about.
#
# Build with: latexmk -pdf suport.tex

$aux_dir = '_build';
$out_dir = '.';
$pdf_mode = 1;
