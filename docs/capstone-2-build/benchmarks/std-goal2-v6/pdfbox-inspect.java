import java.nio.file.Path;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.apache.pdfbox.text.PDFTextStripper;
import javax.imageio.ImageIO;

/** Offline only. Extract newly authored synthetic v6 PDF text, no provider or Drive calls. */
class V6PdfboxInspect {
  public static void main(String[] args) throws Exception {
    if(args.length == 3 && args[0].equals("--render-first")) {
      try (PDDocument doc = Loader.loadPDF(Path.of(args[1]).toFile())) {
        if(doc.isEncrypted() || doc.getNumberOfPages()<1) throw new IllegalStateException("Not renderable");
        ImageIO.write(new PDFRenderer(doc).renderImageWithDPI(0,100),"png",Path.of(args[2]).toFile());
        System.out.println("Rendered synthetic preview to the designated local inspection path");
      }
      return;
    }
    if(args.length == 4 && args[0].equals("--render-page")) {
      int pageNumber=Integer.parseInt(args[2]);
      try (PDDocument doc = Loader.loadPDF(Path.of(args[1]).toFile())) {
        if(doc.isEncrypted() || pageNumber<0 || pageNumber>=doc.getNumberOfPages())
          throw new IllegalStateException("No renderable selected page");
        ImageIO.write(new PDFRenderer(doc).renderImageWithDPI(pageNumber,120),
          "png",Path.of(args[3]).toFile());
        System.out.println("Rendered PDFBox page "+(pageNumber+1)+" of synthetic input");
      }
      return;
    }
    for (String filename : args) {
      try (PDDocument doc = Loader.loadPDF(Path.of(filename).toFile())) {
        if (doc.isEncrypted() || doc.getNumberOfPages() < 1) {
          throw new IllegalStateException("Expected valid readable fixture " + filename);
        }
        String content = new PDFTextStripper().getText(doc);
        System.out.println(Path.of(filename).getFileName() + "|" + doc.getNumberOfPages() + "|"
          + Base64.getEncoder().encodeToString(content.getBytes(StandardCharsets.UTF_8)));
      }
    }
  }
}
