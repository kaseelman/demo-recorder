// Screen capture (ScreenCaptureKit) written to an HEVC .mov with AVAssetWriter.
import AVFoundation
import CoreMedia
import Foundation
import QuartzCore
import ScreenCaptureKit

final class Capture: NSObject, SCStreamOutput, SCStreamDelegate {
    let queue = DispatchQueue(label: "capture")
    var stream: SCStream?
    var writer: AVAssetWriter!
    var input: AVAssetWriterInput!
    var t0: Double?          // host time (seconds) of the first frame = video time 0
    var frames = 0
    var dropped = 0
    var onFirstFrame: () -> Void = {}
    var onError: (Error) -> Void = { _ in }
    let widthPx: Int, heightPx: Int, fps: Int, showCursor: Bool

    init(widthPx: Int, heightPx: Int, fps: Int, showCursor: Bool) {
        self.widthPx = widthPx; self.heightPx = heightPx; self.fps = fps; self.showCursor = showCursor
    }

    func start(filter: SCContentFilter, url: URL) throws {
        writer = try AVAssetWriter(outputURL: url, fileType: .mov)
        let bitrate = Int(Double(widthPx * heightPx * fps) * 0.15)
        input = AVAssetWriterInput(mediaType: .video, outputSettings: [
            AVVideoCodecKey: AVVideoCodecType.hevc,
            AVVideoWidthKey: widthPx,
            AVVideoHeightKey: heightPx,
            AVVideoCompressionPropertiesKey: [
                AVVideoAverageBitRateKey: bitrate,
                AVVideoExpectedSourceFrameRateKey: fps,
                AVVideoMaxKeyFrameIntervalKey: fps * 2,
            ],
            AVVideoColorPropertiesKey: [
                AVVideoColorPrimariesKey: AVVideoColorPrimaries_ITU_R_709_2,
                AVVideoTransferFunctionKey: AVVideoTransferFunction_ITU_R_709_2,
                AVVideoYCbCrMatrixKey: AVVideoYCbCrMatrix_ITU_R_709_2,
            ],
        ])
        input.expectsMediaDataInRealTime = true
        writer.add(input)
        guard writer.startWriting() else { throw writer.error ?? NSError(domain: "writer", code: 1) }

        let cfg = SCStreamConfiguration()
        cfg.width = widthPx
        cfg.height = heightPx
        cfg.minimumFrameInterval = CMTime(value: 1, timescale: CMTimeScale(fps))
        cfg.showsCursor = showCursor
        cfg.pixelFormat = kCVPixelFormatType_32BGRA
        cfg.colorSpaceName = CGColorSpace.sRGB
        cfg.queueDepth = 8
        cfg.capturesAudio = false

        let s = SCStream(filter: filter, configuration: cfg, delegate: self)
        try s.addStreamOutput(self, type: .screen, sampleHandlerQueue: queue)
        stream = s
        s.startCapture { [weak self] err in
            if let err { DispatchQueue.main.async { self?.onError(err) } }
        }
    }

    func stream(_ stream: SCStream, didOutputSampleBuffer sb: CMSampleBuffer, of type: SCStreamOutputType) {
        guard type == .screen, sb.isValid,
              let atts = CMSampleBufferGetSampleAttachmentsArray(sb, createIfNecessary: false) as? [[SCStreamFrameInfo: Any]],
              let raw = atts.first?[.status] as? Int,
              SCFrameStatus(rawValue: raw) == .complete else { return }

        let pts = CMSampleBufferGetPresentationTimeStamp(sb)
        if t0 == nil {
            writer.startSession(atSourceTime: pts)
            // Frame timestamps use the host clock, same as CACurrentMediaTime().
            // Fall back to "now" if that assumption ever doesn't hold.
            let now = CACurrentMediaTime()
            t0 = abs(now - pts.seconds) < 1.0 ? pts.seconds : now
            DispatchQueue.main.async { self.onFirstFrame() }
        }
        if input.isReadyForMoreMediaData { input.append(sb); frames += 1 } else { dropped += 1 }
    }

    func stream(_ stream: SCStream, didStopWithError error: Error) {
        DispatchQueue.main.async { self.onError(error) }
    }

    func finish(completion: @escaping () -> Void) {
        let endHost = CACurrentMediaTime()
        let done = { [self] in
            queue.async { [self] in
                guard t0 != nil else { completion(); return }
                input.markAsFinished()
                // Extend the last frame up to the moment we stopped.
                writer.endSession(atSourceTime: CMTime(seconds: endHost, preferredTimescale: 600))
                writer.finishWriting { completion() }
            }
        }
        if let s = stream { s.stopCapture { _ in done() } } else { done() }
    }
}
