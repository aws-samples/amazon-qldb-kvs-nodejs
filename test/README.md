# Setting up test on Github Action

1. Create a QLDB ledger named `vehicle-registration` with default encryption (AWS owned key) in `us-east-1` region.

2. Deploy this CloudFormation stack in your account in `us-east-1` region. Note down the IAM Role ARN.

    ```yaml
    Parameters:
    GitHubOrg:
        Type: String
        Default: "aws-samples"
    RepositoryName:
        Type: String
        Default: "amazon-qldb-kvs-nodejs"
    QLDBLedgerName:
        Type: String
        Default: "vehicle-registration"
    OIDCProviderArn:
        Description: Arn for the GitHub OIDC Provider.
        Default: ""
        Type: String

    Conditions:
    CreateOIDCProvider: !Equals 
        - !Ref OIDCProviderArn
        - ""

    Resources:
    Role:
        Type: AWS::IAM::Role
        Properties:
        AssumeRolePolicyDocument:
            Statement:
            - Effect: Allow
                Action: sts:AssumeRoleWithWebIdentity
                Principal:
                Federated: !If 
                    - CreateOIDCProvider
                    - !Ref GithubOidc
                    - !Ref OIDCProviderArn
                Condition:
                StringLike:
                    token.actions.githubusercontent.com:sub: !Sub repo:${GitHubOrg}/${RepositoryName}:*
    Policy:
        DependsOn:
        - Role
        Type: AWS::IAM::Policy
        Properties:
        PolicyName: qldb-access
        Roles:
            - Ref: Role
        PolicyDocument:
            Version: '2012-10-17'
            Statement:
            - Effect: Allow
            Action:
            - qldb:GetBlock
            - qldb:ListLedgers
            - qldb:GetRevision
            - qldb:DescribeLedger
            - qldb:SendCommand
            - qldb:GetDigest
            Resource:
            - Fn::Join:
                - ''
                - - 'arn:aws:qldb:'
                - Ref: AWS::Region
                - ":"
                - Ref: AWS::AccountId
                - ":ledger/"
                - Ref: QLDBLedgerName
            - Effect: Allow
            Action:
            - qldb:PartiQLCreateTable
            - qldb:PartiQLCreateIndex
            - qldb:PartiQLInsert
            - qldb:PartiQLUpdate
            - qldb:PartiQLSelect
            - qldb:PartiQLHistoryFunction
            Resource:
            - Fn::Join:
                - ''
                - - 'arn:aws:qldb:'
                - Ref: AWS::Region
                - ":"
                - Ref: AWS::AccountId
                - ":ledger/"
                - Ref: QLDBLedgerName
                - "/table/*"
            - Effect: Allow
            Action:
            - qldb:PartiQLSelect
            Resource:
            - Fn::Join:
                - ''
                - - 'arn:aws:qldb:'
                - Ref: AWS::Region
                - ":"
                - Ref: AWS::AccountId
                - ":ledger/"
                - Ref: QLDBLedgerName
                - "/information_schema/user_tables"

    GithubOidc:
        Type: AWS::IAM::OIDCProvider
        Condition: CreateOIDCProvider
        Properties:
        Url: https://token.actions.githubusercontent.com
        ClientIdList: 
            - sts.amazonaws.com
        ThumbprintList:
            - 6938fd4d98bab03faadb97b34396831e3780aea1

    Outputs:
    Role:
        Value: !GetAtt Role.Arn 
    ```

3. [Create a Github secret](https://docs.github.com/en/actions/security-guides/encrypted-secrets#creating-encrypted-secrets-for-a-repository) `IAM_ROLE_TO_ASSUME` and put the IAM Role ARN as the secret value.
