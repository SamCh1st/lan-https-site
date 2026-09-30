import _bootstrap  # Shared backend import path for tests and previews.
import io
import unittest
from unittest.mock import patch
from PIL import Image, ImageDraw
import local_art
from transparent_art import remove_backdrop

class TransparentArtTests(unittest.TestCase):
    def fixture(self):
        image=Image.new('RGBA',(64,64),(255,0,255,255))
        draw=ImageDraw.Draw(image)
        draw.rectangle((16,16,48,48),fill=(255,255,255,255))
        draw.rectangle((25,25,30,30),fill=(255,0,255,255))
        data=io.BytesIO();image.save(data,format='PNG');return data.getvalue()

    def test_alpha_and_subject_preserved(self):
        data,removed=remove_backdrop(self.fixture());self.assertTrue(removed)
        image=Image.open(io.BytesIO(data))
        self.assertEqual(image.getpixel((0,0))[3],0)
        self.assertEqual(image.getpixel((20,20)),(255,255,255,255))
        self.assertEqual(image.getpixel((27,27)),(255,0,255,255))

    def test_non_key_background_not_deleted(self):
        data=io.BytesIO();Image.new('RGB',(16,16),'white').save(data,format='PNG')
        result,removed=remove_backdrop(data.getvalue());self.assertFalse(removed);self.assertEqual(result,data.getvalue())

    def test_generation_default_and_opt_out(self):
        for enabled in (True,False):
            with patch.object(local_art,'ready',return_value=True),patch.object(local_art,'render',return_value=iter([{'event':'pixels','data':self.fixture()}])) as render, patch('background_removal.remove_background',side_effect=lambda data: remove_backdrop(data)[0]) as removal:
                events=list(local_art.design('a white sword',None,512,[],None,False,enabled))
            self.assertEqual('A separate AI will remove the backdrop' in render.call_args.args[0],enabled)
            self.assertEqual(removal.call_count,1 if enabled else 0)
            image=Image.open(io.BytesIO(next(e['data'] for e in events if e['event']=='pixels')))
            self.assertEqual(image.getpixel((0,0))[3],0 if enabled else 255)

    def test_removal_failure_never_publishes_uncut_image(self):
        events=[]
        with patch.object(local_art,'ready',return_value=True),patch.object(local_art,'render',return_value=iter([{'event':'pixels','data':self.fixture()}])),patch('background_removal.remove_background',side_effect=ValueError('No subject')):
            with self.assertRaises(ValueError):
                for event in local_art.design('sword',None,512,[],None,False,True):events.append(event)
        self.assertFalse(any(e['event'] in ('pixels','done') for e in events))

    def test_white_backdrop_preserves_enclosed_white_details(self):
        image=Image.new('RGB',(64,64),'white')
        draw=ImageDraw.Draw(image)
        draw.rectangle((16,12,48,52),fill='#503729')
        draw.rectangle((22,18,40,35),fill='white')
        data=io.BytesIO();image.save(data,format='PNG')
        result,removed=remove_backdrop(data.getvalue());self.assertTrue(removed)
        cutout=Image.open(io.BytesIO(result))
        self.assertEqual(cutout.getpixel((0,0))[3],0)
        self.assertEqual(cutout.getpixel((25,25)),(255,255,255,255))
        self.assertEqual(cutout.getpixel((18,15)),(80,55,41,255))

    def test_varied_scenery_is_not_treated_as_white_backdrop(self):
        image=Image.new('RGB',(64,64),'#8099aa')
        ImageDraw.Draw(image).rectangle((0,0,63,15),fill='white')
        data=io.BytesIO();image.save(data,format='PNG')
        result,removed=remove_backdrop(data.getvalue())
        self.assertFalse(removed);self.assertEqual(result,data.getvalue())

if __name__=='__main__':unittest.main()
