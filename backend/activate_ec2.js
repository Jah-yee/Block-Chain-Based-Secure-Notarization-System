const { EC2Client, DescribeInstancesCommand } = require("@aws-sdk/client-ec2");
const { SSMClient, SendCommandCommand, GetCommandInvocationCommand } = require("@aws-sdk/client-ssm");
const dotenv = require("dotenv");
const path = require("path");

// Load backend .env for credentials (now in the same directory)
dotenv.config({ path: path.join(__dirname, ".env") });

const IP_ADDRESS = "13.233.236.240";
const REGION = process.env.AWS_REGION?.replace("-an", "") || "ap-south-1";

async function activate() {
    const ec2 = new EC2Client({ region: REGION });
    const ssm = new SSMClient({ region: REGION });

    console.log(`🔍 [1/4] Searching for Instance ID with IP: ${IP_ADDRESS}...`);
    const describe = await ec2.send(new DescribeInstancesCommand({
        Filters: [{ Name: "ip-address", Values: [IP_ADDRESS] }]
    }));

    const instances = describe.Reservations.flatMap(r => r.Instances);
    if (instances.length === 0) {
        console.error("❌ ERROR: Could not find Instance ID for the given IP. Ensure credentials and region are correct.");
        process.exit(1);
    }

    const instanceId = instances[0].InstanceId;
    console.log(`✅ [2/4] Found Instance ID: ${instanceId}`);

    const commands = [
        "export HOME=/home/ubuntu",
        "cd /home/ubuntu/BBSNS/Web-App",
        "echo 'NEXT_PUBLIC_API_URL=http://13.233.236.240:5000' > .env.local",
        "npm install",
        "npm run build",
        "pm2 delete bbsns-web || true",
        "pm2 start 'npm run start -- -p 3000 -H 0.0.0.0' --name bbsns-web",
        
        "cd /home/ubuntu/BBSNS/'Frontend Desktop Application'/'Remote Auth'",
        "echo 'VITE_BACKEND_URL=http://13.233.236.240:5000' > .env",
        "npm install",
        "npm run build",
        "pm2 delete bbsns-remote-auth || true",
        "pm2 start 'npx serve -l 3002 -s dist' --name bbsns-remote-auth",
        
        "pm2 save"
    ];

    console.log(`🚀 [3/4] Sending Activation Commands via SSM...`);
    const send = await ssm.send(new SendCommandCommand({
        InstanceIds: [instanceId],
        DocumentName: "AWS-RunShellScript",
        Parameters: { commands: [commands.join(" && ")] }
    }));

    const commandId = send.Command.CommandId;
    console.log(`📡 [4/4] Command Sent. ID: ${commandId}. Waiting for results...`);

    // Poll for status
    let status = "Pending";
    while (status === "Pending" || status === "InProgress") {
        await new Promise(r => setTimeout(r, 5000));
        const invocation = await ssm.send(new GetCommandInvocationCommand({
            CommandId: commandId,
            InstanceId: instanceId
        }));
        status = invocation.Status;
        console.log(`   - Status: ${status}`);
        if (status === "Success") {
            console.log("✅ SUCCESS: All services activated on EC2.");
            console.log("📄 STDOUT:", invocation.StandardOutputContent);
            break;
        } else if (status === "Failed" || status === "Cancelled" || status === "TimedOut") {
            console.error(`❌ ERROR: Command execution ${status}.`);
            console.error("📄 STDERR:", invocation.StandardErrorContent);
            process.exit(1);
        }
    }
}

activate().catch(err => {
    console.error("❌ CRITICAL ERROR:", err.message);
    process.exit(1);
});
