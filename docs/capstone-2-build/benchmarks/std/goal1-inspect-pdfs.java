import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.encryption.InvalidPasswordException;
import org.apache.pdfbox.rendering.PDFRenderer;
import org.apache.pdfbox.text.PDFTextStripper;
import javax.imageio.ImageIO;
import java.awt.image.BufferedImage;

/** Standalone NEW-only PDFBox diagnostic, no Spring / Drive / model calls. */
class Goal1InspectPdfs {
    public static void main(String[] args) throws Exception {
        if (args.length >= 3 && "--render-check".equals(args[0])) {
            Path outputFolder = Path.of(args[1]);
            Files.createDirectories(outputFolder);
            for (int fileIndex = 2; fileIndex < args.length; fileIndex++) {
                Path input = Path.of(args[fileIndex]);
                try (PDDocument doc = Loader.loadPDF(input.toFile())) {
                    if (doc.isEncrypted()) throw new IllegalArgumentException("Only unencrypted PDF previews are supported");
                    PDFRenderer renderer = new PDFRenderer(doc);
                    for (int n = 0; n < doc.getNumberOfPages(); n++) {
                        BufferedImage preview = renderer.renderImageWithDPI(n, 90);
                        int width = preview.getWidth(), height = preview.getHeight();
                        int minX = width, minY = height, maxX = -1, maxY = -1, ink = 0;
                        for (int y = 0; y < height; y++) {
                            for (int x = 0; x < width; x++) {
                                int rgb = preview.getRGB(x,y);
                                // Ignore nearly white page backgrounds and antialiasing noise.
                                int r=(rgb>>16)&255,g=(rgb>>8)&255,b=rgb&255;
                                if (r<235||g<235||b<235) {
                                    ink++;
                                    minX=Math.min(minX,x);maxX=Math.max(maxX,x);
                                    minY=Math.min(minY,y);maxY=Math.max(maxY,y);
                                }
                            }
                        }
                        if (ink<100 || minX<5 || minY<5 || maxX>=width-5 || maxY>=height-5)
                            throw new AssertionError("Potential blank/clipped page "+input.getFileName()+
                                " p"+(n+1)+" ink="+ink+" bbox="+minX+","+minY+"-"+maxX+","+maxY);
                        Path file = outputFolder.resolve(input.getFileName()+"-page-"+(n+1)+".png");
                        if (Files.exists(file)) throw new IllegalArgumentException("Preview already exists: "+file);
                        ImageIO.write(preview,"png",file.toFile());
                        System.out.println(input.getFileName()+"|p"+(n+1)+"|"+width+"x"+height+
                            "|ink="+ink+"|bbox="+minX+","+minY+","+maxX+","+maxY);
                    }
                }
            }
            return;
        }
        if (args.length == 3 && "--render".equals(args[0])) {
            Path input = Path.of(args[1]);
            Path output = Path.of(args[2]);
            if (Files.exists(output)) throw new IllegalArgumentException("Preview output already exists");
            try (PDDocument doc = Loader.loadPDF(input.toFile())) {
                if (doc.isEncrypted() || doc.getNumberOfPages() == 0)
                    throw new IllegalArgumentException("Not a renderable valid unencrypted PDF");
                ImageIO.write(new PDFRenderer(doc).renderImageWithDPI(0, 90), "png", output.toFile());
            }
            System.out.println("Rendered synthetic preview to an ignored local directory.");
            return;
        }
        for (String name : args) {
            Path file = Path.of(name);
            byte[] bytes = Files.readAllBytes(file);
            String state;
            int pages = 0;
            String extracted = "";
            if (bytes.length < 5 || !new String(bytes,0,5,StandardCharsets.US_ASCII).equals("%PDF-")) {
                state = "NOT_PDF";
            } else {
                try (PDDocument doc = Loader.loadPDF(file.toFile())) {
                    pages = doc.getNumberOfPages();
                    state = doc.isEncrypted() ? "ENCRYPTED" : "READABLE";
                    if (!doc.isEncrypted()) extracted = new PDFTextStripper().getText(doc);
                } catch (InvalidPasswordException password) {
                    state = "ENCRYPTED";
                } catch (Exception malformed) {
                    state = "CORRUPT";
                }
            }
            String encoded = Base64.getEncoder().encodeToString(extracted.getBytes(StandardCharsets.UTF_8));
            System.out.println(file.getFileName()+"|"+state+"|"+pages+"|"+extracted.length()+"|"+encoded);
        }
    }
}
