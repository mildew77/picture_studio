# Picture Studio

Picture Studio is a browser-based real-estate flyer editor. Start from a flyer PNG, replace or cover its existing content, add editable layers, preview the final raster output, and download a finished PNG.

A working deployment is available at [https://picture-studio.marshall.mortgage/](https://picture-studio.marshall.mortgage/).

## What it does

- Replaces the base flyer with a PNG or JPEG.
- Identifies editable source areas as original layers, which can be removed or reordered when covering existing flyer content.
- Adds text and picture layers, with drag, resize, duplicate, delete, opacity, corner-radius, dimensions, and z-index controls.
- Edits text with rich inline formatting: bold, italic, font, and color can be applied to only the selected text.
- Supports Proxima Nova, Proxima Nova Medium, Proxima Nova Semibold, Proxima Nova Condensed, Proxima Nova A, and common fallback fonts.
- Provides text-wide controls for font size, font weight, alignment, text color, background color, line height, and independent inner padding on every side.
- Lets you move layout sections vertically and set a z-index for each section.
- Includes a Quick Tips carousel with example FSBO, advertising-claim, and lender-identification reminders.
- Builds a 1080 × 1350 PNG preview before download. The preview is the file that is downloaded.

## AI updates

The export preview includes **Update with AI** when the deployed API endpoint is available. Each result is shown beside the current version before anything is changed.

### Creative redesign

Sends the rendered flyer and a prompt to the AI service. Choose **Use this version** only after reviewing the proposal. A chosen result is treated as a complete, flattened flyer, so the PNG download matches the AI proposal without old section slices, overlays, or footer cropping being redrawn over it.

### Safe photo edit

Sends only one selected picture layer and a prompt to the AI service. It updates that image layer while leaving the other flyer content unchanged. Add or select a picture layer before using this mode.

The backend uses the OpenAI Image API with `gpt-image-2.5-sunburst` for image edits. OpenAI documents the Image API as appropriate for single-prompt image edits and the Responses API for conversational, multi-turn image experiences. See the [official image-generation guide](https://developers.openai.com/api/docs/guides/image-generation).

## Run locally

Picture Studio has no npm dependencies. Use the included dependency-free Node server rather than opening `index.html` with `file://`:

```bash
cd /Users/marshallhawkins/Developer/picture
node server.js
```

Open [http://localhost:4173](http://localhost:4173). The server sends no-cache headers so refreshing the browser loads current HTML, CSS, and JavaScript.

The launcher clears an existing listener on port 4173 before starting. To use another port without disturbing that listener:

```bash
PORT=4174 node server.js
```

Opening the editor directly as a local file can display the flyer, but browser security restrictions can prevent the PNG-export pipeline from loading its assets correctly.

## Use the editor

1. Choose **Replace base PNG** to load a flyer image, if needed.
2. Click an editable highlighted source area to select an original layer, or click **Add text** or **Add picture** to create a new layer.
3. Use the right-side properties panel to style the selected layer. Drag the layer on the canvas and use its corner control to resize it.
4. Use **Layout sections** to nudge a section or change its stack order. **Reset section positions** restores their original vertical positions.
5. Click **Review PNG** to create the export preview. Download it directly, or choose **Update with AI** to create and review an AI result first.

## Deployment

Terraform in [`infra/`](infra/) deploys the application to AWS:

- A private S3 bucket hosts the static editor assets.
- CloudFront serves the site through Origin Access Control (OAC).
- ACM provides the HTTPS certificate and Route 53 creates the custom-domain alias record.
- API Gateway invokes a short-lived Lambda that queues AI jobs.
- A worker Lambda retrieves the image from a private S3 jobs bucket, calls OpenAI, and saves the result.
- DynamoDB records job status while the browser polls for completion.
- AI job input and output images have a one-day lifecycle.

See [`infra/README.md`](infra/README.md) for prerequisites and Terraform steps, and [`backend/README.md`](backend/README.md) for OpenAI secret setup.

### Deploy or update

```bash
cd /Users/marshallhawkins/Developer/picture/infra
cp terraform.tfvars.example terraform.tfvars
# Fill in the required values, including the OpenAI secret ARN.
terraform init
terraform plan
terraform apply
```

Never put an OpenAI API key in `terraform.tfvars`, `ai-config.js`, source code, or the browser. Store it in AWS Secrets Manager and supply only its ARN to Terraform. The Terraform deployment generates the browser-safe `ai-config.js` file containing the API Gateway endpoint.

If a recent deployment is not visible, invalidate CloudFront's cached assets:

```bash
aws cloudfront create-invalidation \
  --distribution-id "$(terraform output -raw cloudfront_distribution_id)" \
  --paths '/*' \
  --profile image_builder
```

## Repository layout

```text
.
├── index.html                 # Editor and modal markup
├── app.js                     # Canvas editor, PNG export, and AI-review flow
├── styles.css                 # Editor and dialog styling
├── picture-studio-base.png    # Default flyer template
├── server.js                  # Dependency-free local static server
├── ai-config.js               # Local API config placeholder; generated on deploy
├── backend/
│   ├── lambda/                # API and asynchronous AI-worker Lambdas
│   └── README.md              # Secrets and backend setup
└── infra/                     # Terraform, deploy policy, and infrastructure docs
```

## Local and generated files

The repository ignores local dependencies, Terraform state, local `.tfvars` files, `.env` files, generated exports, and editor/build output. Keep Zillow images or other Zillow-sourced working files in `Zillow Files/`; that folder is ignored by Git on the default case-insensitive macOS filesystem. A hyphenated folder such as `zillow-files/` is not covered by that rule.

## Security and cost controls

The AI API should be protected before the site is broadly shared. CORS limits browser origins but does not authenticate direct requests. Add authentication and rate limiting to prevent unauthorized use of the OpenAI-backed endpoint and unwanted API spend.
