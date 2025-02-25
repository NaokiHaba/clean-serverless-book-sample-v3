import {Architecture, DockerImageCode, DockerImageFunction} from "aws-cdk-lib/aws-lambda"; // AWS Lambdaに関連するクラスをインポート
import {Duration, RemovalPolicy, Stack, StackProps} from 'aws-cdk-lib'; // CDKのスタックやプロパティ、削除ポリシーをインポート
import {Construct} from 'constructs'; // CDKの構造体をインポート
import {LambdaIntegration, RestApi} from 'aws-cdk-lib/aws-apigateway'; // API GatewayのREST APIとLambda統合をインポート
import {AttributeType, BillingMode, Table} from 'aws-cdk-lib/aws-dynamodb'; // DynamoDBのテーブル、属性タイプ、課金モードをインポート
import {Effect, PolicyStatement} from 'aws-cdk-lib/aws-iam'; // IAMポリシーの効果とポリシーステートメントをインポート
import * as dotenv from 'dotenv'; // 環境変数を管理するためのdotenvライブラリをインポート

// .envファイルを読み込む
dotenv.config({path: '../.env'}); // 環境変数を設定するために、指定したパスから.envファイルを読み込む

// CDKスタックの定義
export class CdkStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props); // スーパークラスのコンストラクタを呼び出す

    // DynamoDBテーブルの作成
    const dynamoTable = new Table(this, 'ResourceTable', {
      // DynamoDBテーブル内のアイテムを一意に識別するためのキー
      partitionKey: { name: 'PK', type: AttributeType.STRING }, // パーティションキーを定義
      // 同じパーティションキーを持つアイテムをさらに区別するためのキー
      sortKey: { name: 'SK', type: AttributeType.STRING }, // ソートキーを定義
      tableName: process.env.DYNAMO_TABLE_NAME, // 環境変数からテーブル名を取得
      // リクエストごとに課金されるモード
      billingMode: BillingMode.PAY_PER_REQUEST, // 課金モードを設定
      // スタックを削除したときにテーブルも削除される
      removalPolicy: RemovalPolicy.DESTROY, // 削除ポリシーを設定
    });

    // API Gatewayの作成
    const api = new RestApi(this, 'CleanServerlessBookSampleApi', {
      restApiName: 'CleanServerlessBookSampleAPI', // APIの名前を設定
      deployOptions: {
        stageName: 'dev', // デプロイオプションでステージ名を設定
      },
    });

    // Lambda関数とAPI Gatewayの統合を作成するための関数
    const imagePath = "../app"; // Dockerイメージのパスを定義
    const createLambdaFunction = (target: string, functionName: string) => {
      return new DockerImageFunction(this, functionName, {
        functionName: `clean-serverless-${functionName}`, // 関数名を設定
        code: DockerImageCode.fromImageAsset(imagePath, { // Dockerイメージコードを指定
          target: target, // Dockerビルドのターゲットを指定
        }),
        architecture: Architecture.ARM_64, // Lambda関数のアーキテクチャをARM64に設定
        timeout: Duration.seconds(30), // タイムアウトを30秒に設定
        memorySize: 1280, // メモリサイズを1280MBに設定
        environment: { // 環境変数を設定
          DYNAMO_TABLE_NAME: process.env.DYNAMO_TABLE_NAME || '', // DynamoDBテーブル名を環境変数から取得
          DYNAMO_PK_NAME: process.env.DYNAMO_PK_NAME || '', // DynamoDBのパーティションキー名を環境変数から取得
          DYNAMO_SK_NAME: process.env.DYNAMO_SK_NAME || '', // DynamoDBのソートキー名を環境変数から取得
        }
      });
    };

    // API GatewayとLambda関数の統合を追加するための関数
    const addApiIntegration = (path: string, method: string, lambdaFunction: DockerImageFunction) => {
      const integration = new LambdaIntegration(lambdaFunction); // Lambda統合を作成
      api.root.resourceForPath(path).addMethod(method, integration); // 指定されたパスにメソッドを追加
    };

    // Lambda関数の定義
    const functions = [
      { name: 'deleteMicropost', method: 'DELETE', apiPath: '/v1/users/{user_id}/microposts/{micropost_id}' },
      { name: 'deleteUser', method: 'DELETE', apiPath: '/v1/users/{user_id}' },
      { name: 'getMicropost', method: 'GET', apiPath: '/v1/users/{user_id}/microposts/{micropost_id}' },
      { name: 'getMicroposts', method: 'GET', apiPath: '/v1/users/{user_id}/microposts' },
      { name: 'getUser', method: 'GET', apiPath: '/v1/users/{user_id}' },
      { name: 'getUsers', method: 'GET', apiPath: '/v1/users' },
      { name: 'postMicroposts', method: 'POST', apiPath: '/v1/users/{user_id}/microposts' },
      { name: 'postUsers', method: 'POST', apiPath: '/v1/users' },
      { name: 'putMicropost', method: 'PUT', apiPath: '/v1/users/{user_id}/microposts/{micropost_id}' },
      { name: 'putUser', method: 'PUT', apiPath: '/v1/users/{user_id}' }
    ];

    // Lambda関数を作成し、API Gatewayと統合する
    functions.forEach(({ name, apiPath, method }) => {
      const lambdaFunction = createLambdaFunction('api', name); // Lambda関数を作成
      dynamoTable.grantFullAccess(lambdaFunction); // DynamoDBテーブルへのフルアクセスを付与
      lambdaFunction.addToRolePolicy(new PolicyStatement({ // IAMポリシーを追加
        actions: ['dynamodb:*', 'logs:*'], // DynamoDBとCloudWatch Logsに対するすべてのアクションを許可
        effect: Effect.ALLOW, // 許可の効果を設定
        resources: ['*'], // リソースをすべて指定
      }));
      addApiIntegration(apiPath, method, lambdaFunction); // API GatewayとLambda関数の統合を追加
    });
  }
}
